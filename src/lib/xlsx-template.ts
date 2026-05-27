import { deflateRawSync, inflateRawSync } from "node:zlib";

export type XlsxCellValue = string | number | boolean | null | undefined;

export type XlsxTemplateImage = {
  worksheet: string;
  cell: string;
  data: Buffer;
  extension: string;
  contentType: string;
  width?: number;
  height?: number;
  altText?: string;
};

type ZipEntry = {
  name: string;
  data: Buffer;
  modTime: number;
  modDate: number;
  externalAttributes: number;
};

type DrawingImage = {
  id: number;
  cell: string;
  relId: string;
  name: string;
  altText: string;
  width: number;
  height: number;
  relationshipTarget: string;
};

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const RELATIONSHIPS_NAMESPACE =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const DRAWING_RELATIONSHIP_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing";
const IMAGE_RELATIONSHIP_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
const DRAWING_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.drawing+xml";
const EMU_PER_PIXEL = 9525;
const DEFAULT_IMAGE_MAX_WIDTH = 200;
const DEFAULT_IMAGE_MAX_HEIGHT = 68;

const crcTable = new Uint32Array(256);

for (let i = 0; i < 256; i++) {
  let c = i;

  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }

  crcTable[i] = c >>> 0;
}

export function fillXlsxTemplate(
  template: Buffer,
  worksheetUpdates: Record<string, Record<string, XlsxCellValue>>,
  worksheetImages: XlsxTemplateImage[] = []
) {
  const entries = readZipEntries(template);

  for (const entry of entries) {
    const updates = worksheetUpdates[entry.name];

    if (!updates) {
      continue;
    }

    let xml = entry.data.toString("utf8");

    for (const [cellRef, value] of Object.entries(updates)) {
      xml = setCellValue(xml, cellRef, value);
    }

    entry.data = Buffer.from(xml, "utf8");
  }

  if (worksheetImages.length > 0) {
    addWorksheetImages(entries, worksheetImages);
  }

  return writeZipEntries(entries);
}

function addWorksheetImages(entries: ZipEntry[], worksheetImages: XlsxTemplateImage[]) {
  const contentTypesEntry = findEntry(entries, "[Content_Types].xml");

  if (!contentTypesEntry) {
    throw new Error("Invalid XLSX content types.");
  }

  let contentTypesXml = contentTypesEntry.data.toString("utf8");
  let nextDrawingNumber = getNextPartNumber(entries, /^xl\/drawings\/drawing(\d+)\.xml$/);
  let nextImageNumber = getNextPartNumber(entries, /^xl\/media\/image(\d+)\.[^.]+$/);
  const imagesByWorksheet = new Map<string, XlsxTemplateImage[]>();

  for (const image of worksheetImages) {
    const normalizedExtension = normalizeImageExtension(image.extension);

    if (!normalizedExtension || !image.data.length) {
      continue;
    }

    const normalizedImage = {
      ...image,
      extension: normalizedExtension,
      contentType: normalizeImageContentType(
        image.contentType,
        normalizedExtension
      ),
    };
    const existingImages = imagesByWorksheet.get(image.worksheet) || [];
    existingImages.push(normalizedImage);
    imagesByWorksheet.set(image.worksheet, existingImages);
  }

  for (const [worksheetPath, images] of imagesByWorksheet.entries()) {
    const worksheetEntry = findEntry(entries, worksheetPath);

    if (!worksheetEntry) {
      continue;
    }

    const drawingNumber = nextDrawingNumber++;
    const drawingPath = `xl/drawings/drawing${drawingNumber}.xml`;
    const drawingRelsPath = `xl/drawings/_rels/drawing${drawingNumber}.xml.rels`;
    const worksheetRelsPath = getWorksheetRelationshipsPath(worksheetPath);
    const worksheetRelsEntry =
      findEntry(entries, worksheetRelsPath) ||
      addEntry(entries, worksheetRelsPath, emptyRelationshipsXml(), worksheetEntry);

    const drawingRelationshipId = getNextRelationshipId(
      worksheetRelsEntry.data.toString("utf8")
    );
    worksheetRelsEntry.data = Buffer.from(
      appendRelationship(
        worksheetRelsEntry.data.toString("utf8"),
        drawingRelationshipId,
        DRAWING_RELATIONSHIP_TYPE,
        `../drawings/drawing${drawingNumber}.xml`
      ),
      "utf8"
    );

    let worksheetXml = worksheetEntry.data.toString("utf8");
    worksheetXml = ensureWorksheetDrawing(worksheetXml, drawingRelationshipId);

    const drawingImages = images.map((image, index) => {
      const imageNumber = nextImageNumber++;
      const imagePath = `xl/media/image${imageNumber}.${image.extension}`;
      const relId = `rId${index + 1}`;
      const size = fitImageSize(image);

      addEntry(entries, imagePath, image.data, worksheetEntry);
      contentTypesXml = ensureDefaultContentType(
        contentTypesXml,
        image.extension,
        image.contentType
      );
      worksheetXml = setRowHeight(worksheetXml, getCellRowNumber(image.cell), 72);

      return {
        id: index + 1,
        cell: image.cell,
        relId,
        name: `Screenshot ${index + 1}`,
        altText: image.altText || `Screenshot ${index + 1}`,
        width: image.width || size.width,
        height: image.height || size.height,
        relationshipTarget: `../media/image${imageNumber}.${image.extension}`,
      };
    });

    worksheetEntry.data = Buffer.from(worksheetXml, "utf8");
    addEntry(
      entries,
      drawingPath,
      Buffer.from(renderDrawingXml(drawingImages), "utf8"),
      worksheetEntry
    );
    addEntry(
      entries,
      drawingRelsPath,
      Buffer.from(renderDrawingRelationshipsXml(drawingImages), "utf8"),
      worksheetEntry
    );
    contentTypesXml = ensureOverrideContentType(
      contentTypesXml,
      `/${drawingPath}`,
      DRAWING_CONTENT_TYPE
    );
  }

  contentTypesEntry.data = Buffer.from(contentTypesXml, "utf8");
}

function findEntry(entries: ZipEntry[], name: string) {
  return entries.find((entry) => entry.name === name);
}

function addEntry(
  entries: ZipEntry[],
  name: string,
  data: Buffer | string,
  referenceEntry?: ZipEntry
) {
  const existingEntry = findEntry(entries, name);
  const entryData = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");

  if (existingEntry) {
    existingEntry.data = entryData;
    return existingEntry;
  }

  const entry: ZipEntry = {
    name,
    data: entryData,
    modTime: referenceEntry?.modTime || 0,
    modDate: referenceEntry?.modDate || 0,
    externalAttributes: 0,
  };

  entries.push(entry);
  return entry;
}

function getNextPartNumber(entries: ZipEntry[], pattern: RegExp) {
  let highestNumber = 0;

  for (const entry of entries) {
    const match = entry.name.match(pattern);

    if (match) {
      highestNumber = Math.max(highestNumber, Number(match[1]));
    }
  }

  return highestNumber + 1;
}

function getWorksheetRelationshipsPath(worksheetPath: string) {
  const fileName = worksheetPath.split("/").pop();
  return worksheetPath.replace(
    /\/([^/]+)$/,
    `/_rels/${fileName}.rels`
  );
}

function emptyRelationshipsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${RELATIONSHIPS_NAMESPACE}"></Relationships>`;
}

function getNextRelationshipId(xml: string) {
  let highestNumber = 0;

  for (const match of xml.matchAll(/\bId="rId(\d+)"/g)) {
    highestNumber = Math.max(highestNumber, Number(match[1]));
  }

  return `rId${highestNumber + 1}`;
}

function appendRelationship(
  xml: string,
  id: string,
  type: string,
  target: string
) {
  if (xml.includes(`Id="${id}"`)) {
    return xml;
  }

  const relationshipXml = `<Relationship Id="${escapeXmlAttribute(
    id
  )}" Type="${escapeXmlAttribute(type)}" Target="${escapeXmlAttribute(
    target
  )}"/>`;

  return xml.replace("</Relationships>", `${relationshipXml}</Relationships>`);
}

function ensureWorksheetDrawing(xml: string, relationshipId: string) {
  const drawingPattern = /<drawing\b[^>]*\/>/;
  const drawingXml = `<drawing r:id="${escapeXmlAttribute(relationshipId)}"/>`;

  if (drawingPattern.test(xml)) {
    return xml.replace(drawingPattern, drawingXml);
  }

  return xml.replace("</worksheet>", `${drawingXml}</worksheet>`);
}

function ensureDefaultContentType(
  xml: string,
  extension: string,
  contentType: string
) {
  const escapedExtension = escapeRegExp(extension);
  const defaultPattern = new RegExp(
    `<Default\\b(?=[^>]*\\bExtension="${escapedExtension}")[^>]*/>`
  );

  if (defaultPattern.test(xml)) {
    return xml;
  }

  const defaultXml = `<Default Extension="${escapeXmlAttribute(
    extension
  )}" ContentType="${escapeXmlAttribute(contentType)}"/>`;

  if (xml.includes("<Override")) {
    return xml.replace("<Override", `${defaultXml}<Override`);
  }

  return xml.replace("</Types>", `${defaultXml}</Types>`);
}

function ensureOverrideContentType(
  xml: string,
  partName: string,
  contentType: string
) {
  const escapedPartName = escapeRegExp(partName);
  const overridePattern = new RegExp(
    `<Override\\b(?=[^>]*\\bPartName="${escapedPartName}")[^>]*/>`
  );

  if (overridePattern.test(xml)) {
    return xml;
  }

  const overrideXml = `<Override PartName="${escapeXmlAttribute(
    partName
  )}" ContentType="${escapeXmlAttribute(contentType)}"/>`;

  return xml.replace("</Types>", `${overrideXml}</Types>`);
}

function renderDrawingXml(images: DrawingImage[]) {
  const anchors = images.map((image) => renderDrawingAnchorXml(image)).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors}</xdr:wsDr>`;
}

function renderDrawingAnchorXml(image: DrawingImage) {
  const cell = parseCellAddress(image.cell);
  const width = Math.max(1, Math.round(image.width * EMU_PER_PIXEL));
  const height = Math.max(1, Math.round(image.height * EMU_PER_PIXEL));

  return `<xdr:oneCellAnchor editAs="oneCell"><xdr:from><xdr:col>${cell.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${cell.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${width}" cy="${height}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${image.id}" name="${escapeXmlAttribute(
    image.name
  )}" descr="${escapeXmlAttribute(
    image.altText
  )}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${escapeXmlAttribute(
    image.relId
  )}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
}

function renderDrawingRelationshipsXml(images: DrawingImage[]) {
  const relationships = images
    .map((image) => {
      return `<Relationship Id="${escapeXmlAttribute(
        image.relId
      )}" Type="${IMAGE_RELATIONSHIP_TYPE}" Target="${escapeXmlAttribute(
        image.relationshipTarget
      )}"/>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${RELATIONSHIPS_NAMESPACE}">${relationships}</Relationships>`;
}

function setRowHeight(xml: string, rowNumber: number, height: number) {
  if (!rowNumber) {
    return xml;
  }

  const rowPattern = new RegExp(
    `<row\\b(?=[^>]*\\br="${rowNumber}")[^>]*>`
  );

  return xml.replace(rowPattern, (rowTag) => {
    return setTagAttribute(
      setTagAttribute(rowTag, "ht", String(height)),
      "customHeight",
      "1"
    );
  });
}

function setTagAttribute(tag: string, name: string, value: string) {
  const attributePattern = new RegExp(`\\s${name}="[^"]*"`);

  if (attributePattern.test(tag)) {
    return tag.replace(
      attributePattern,
      ` ${name}="${escapeXmlAttribute(value)}"`
    );
  }

  return tag.replace(/>$/, ` ${name}="${escapeXmlAttribute(value)}">`);
}

function parseCellAddress(cellRef: string) {
  const match = cellRef.match(/^([A-Z]+)(\d+)$/i);

  if (!match) {
    return { col: 0, row: 0 };
  }

  return {
    col: columnNameToIndex(match[1].toUpperCase()),
    row: Number(match[2]) - 1,
  };
}

function getCellRowNumber(cellRef: string) {
  const row = Number(cellRef.match(/\d+$/)?.[0] || 0);
  return Number.isFinite(row) ? row : 0;
}

function columnNameToIndex(columnName: string) {
  let index = 0;

  for (const char of columnName) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }

  return Math.max(index - 1, 0);
}

function normalizeImageExtension(extension: string) {
  const normalizedExtension = String(extension || "")
    .toLowerCase()
    .replace(/^\./, "");

  if (normalizedExtension === "jpg" || normalizedExtension === "jpeg") {
    return normalizedExtension;
  }

  if (normalizedExtension === "png") {
    return normalizedExtension;
  }

  return "";
}

function normalizeImageContentType(contentType: string, extension: string) {
  if (extension === "png") {
    return "image/png";
  }

  if (extension === "jpg" || extension === "jpeg") {
    return "image/jpeg";
  }

  return contentType || "application/octet-stream";
}

function fitImageSize(image: XlsxTemplateImage) {
  const explicitWidth = Number(image.width || 0);
  const explicitHeight = Number(image.height || 0);

  if (explicitWidth > 0 && explicitHeight > 0) {
    return {
      width: explicitWidth,
      height: explicitHeight,
    };
  }

  const imageSize = getImageSize(image.data);
  const scale = Math.min(
    DEFAULT_IMAGE_MAX_WIDTH / imageSize.width,
    DEFAULT_IMAGE_MAX_HEIGHT / imageSize.height
  );

  return {
    width: Math.max(1, Math.round(imageSize.width * scale)),
    height: Math.max(1, Math.round(imageSize.height * scale)),
  };
}

function getImageSize(data: Buffer) {
  const pngSize = getPngSize(data);

  if (pngSize) {
    return pngSize;
  }

  const jpegSize = getJpegSize(data);

  if (jpegSize) {
    return jpegSize;
  }

  return {
    width: DEFAULT_IMAGE_MAX_WIDTH,
    height: DEFAULT_IMAGE_MAX_HEIGHT,
  };
}

function getPngSize(data: Buffer) {
  const pngSignature = "89504e470d0a1a0a";

  if (data.length < 24 || data.subarray(0, 8).toString("hex") !== pngSignature) {
    return null;
  }

  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
  };
}

function getJpegSize(data: Buffer) {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) {
    return null;
  }

  let offset = 2;

  while (offset < data.length) {
    while (data[offset] === 0xff) {
      offset++;
    }

    const marker = data[offset++];

    if (marker === 0xd9 || marker === 0xda) {
      break;
    }

    if (offset + 2 > data.length) {
      break;
    }

    const blockLength = data.readUInt16BE(offset);

    if (blockLength < 2 || offset + blockLength > data.length) {
      break;
    }

    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker)
    ) {
      return {
        height: data.readUInt16BE(offset + 3),
        width: data.readUInt16BE(offset + 5),
      };
    }

    offset += blockLength;
  }

  return null;
}

function readZipEntries(input: Buffer): ZipEntry[] {
  const eocdOffset = findEndOfCentralDirectory(input);
  const totalEntries = input.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = input.readUInt32LE(eocdOffset + 16);
  const entries: ZipEntry[] = [];

  let offset = centralDirectoryOffset;

  for (let index = 0; index < totalEntries; index++) {
    const signature = input.readUInt32LE(offset);

    if (signature !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error("Invalid XLSX central directory.");
    }

    const flags = input.readUInt16LE(offset + 8);
    const compressionMethod = input.readUInt16LE(offset + 10);
    const modTime = input.readUInt16LE(offset + 12);
    const modDate = input.readUInt16LE(offset + 14);
    const expectedCrc = input.readUInt32LE(offset + 16);
    const compressedSize = input.readUInt32LE(offset + 20);
    const nameLength = input.readUInt16LE(offset + 28);
    const extraLength = input.readUInt16LE(offset + 30);
    const commentLength = input.readUInt16LE(offset + 32);
    const externalAttributes = input.readUInt32LE(offset + 38);
    const localHeaderOffset = input.readUInt32LE(offset + 42);

    const name = input
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString(flags & 0x800 ? "utf8" : "latin1");

    const localSignature = input.readUInt32LE(localHeaderOffset);

    if (localSignature !== LOCAL_FILE_HEADER_SIGNATURE) {
      throw new Error(`Invalid XLSX local header for ${name}.`);
    }

    const localNameLength = input.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = input.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressedData = input.subarray(dataStart, dataStart + compressedSize);

    let data: Buffer;

    if (compressionMethod === 0) {
      data = Buffer.from(compressedData);
    } else if (compressionMethod === 8) {
      data = inflateRawSync(compressedData);
    } else {
      throw new Error(`Unsupported XLSX compression method ${compressionMethod}.`);
    }

    if (crc32(data) !== expectedCrc) {
      throw new Error(`Invalid XLSX CRC for ${name}.`);
    }

    entries.push({
      name,
      data,
      modTime,
      modDate,
      externalAttributes,
    });

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function writeZipEntries(entries: ZipEntry[]) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, "utf8");
    const isDirectory = entry.name.endsWith("/");
    const compressionMethod = isDirectory ? 0 : 8;
    const compressedData = isDirectory
      ? Buffer.alloc(0)
      : deflateRawSync(entry.data);
    const crc = crc32(entry.data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(LOCAL_FILE_HEADER_SIGNATURE, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x800, 6);
    localHeader.writeUInt16LE(compressionMethod, 8);
    localHeader.writeUInt16LE(entry.modTime, 10);
    localHeader.writeUInt16LE(entry.modDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressedData.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuffer, compressedData);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(CENTRAL_DIRECTORY_SIGNATURE, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x800, 8);
    centralHeader.writeUInt16LE(compressionMethod, 10);
    centralHeader.writeUInt16LE(entry.modTime, 12);
    centralHeader.writeUInt16LE(entry.modDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressedData.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(entry.externalAttributes, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + compressedData.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectory = Buffer.concat(centralParts);
  const centralDirectorySize = centralDirectory.length;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectorySize, 12);
  eocd.writeUInt32LE(centralDirectoryOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

function findEndOfCentralDirectory(input: Buffer) {
  const minOffset = Math.max(0, input.length - 22 - 0xffff);

  for (let offset = input.length - 22; offset >= minOffset; offset--) {
    if (input.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }

  throw new Error("Invalid XLSX file.");
}

function setCellValue(xml: string, cellRef: string, value: XlsxCellValue) {
  const escapedRef = escapeRegExp(cellRef);
  const fullCellPattern = new RegExp(
    `<c\\b(?=[^>]*\\br="${escapedRef}")[^>]*>[\\s\\S]*?<\\/c>`
  );
  const selfClosingCellPattern = new RegExp(
    `<c\\b(?=[^>]*\\br="${escapedRef}")[^>]*/>`
  );

  const selfClosingMatch = xml.match(selfClosingCellPattern);

  if (selfClosingMatch) {
    return xml.replace(
      selfClosingCellPattern,
      () => renderCell(selfClosingMatch[0], value)
    );
  }

  const fullMatch = xml.match(fullCellPattern);

  if (fullMatch) {
    return xml.replace(fullCellPattern, () => renderCell(fullMatch[0], value));
  }

  return insertCell(xml, cellRef, value);
}

function renderCell(originalCellXml: string, value: XlsxCellValue) {
  const attrs = originalCellXml.match(/^<c\b([^>/]*)(?:\/>|>)/)?.[1] || "";
  const attrsWithoutType = removeAttribute(attrs, "t");

  if (value === null || value === undefined || value === "") {
    return `<c${attrsWithoutType}/>`;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c${attrsWithoutType}><v>${value}</v></c>`;
  }

  if (typeof value === "boolean") {
    const booleanAttrs = setAttribute(attrsWithoutType, "t", "b");
    return `<c${booleanAttrs}><v>${value ? 1 : 0}</v></c>`;
  }

  const text = String(value);
  const textAttrs = setAttribute(attrsWithoutType, "t", "inlineStr");
  const preserveSpace = /^\s|\s$|\n/.test(text) ? ' xml:space="preserve"' : "";

  return `<c${textAttrs}><is><t${preserveSpace}>${escapeXml(text)}</t></is></c>`;
}

function insertCell(xml: string, cellRef: string, value: XlsxCellValue) {
  const rowNumber = cellRef.match(/\d+$/)?.[0];

  if (!rowNumber) {
    return xml;
  }

  const rowPattern = new RegExp(
    `(<row\\b(?=[^>]*\\br="${rowNumber}")[^>]*>)([\\s\\S]*?)(<\\/row>)`
  );
  const rowMatch = xml.match(rowPattern);

  if (!rowMatch) {
    return xml;
  }

  const cellXml = renderCell(`<c r="${cellRef}"/>`, value);

  return xml.replace(
    rowPattern,
    () => `${rowMatch[1]}${rowMatch[2]}${cellXml}${rowMatch[3]}`
  );
}

function removeAttribute(attrs: string, name: string) {
  return attrs.replace(new RegExp(`\\s${name}="[^"]*"`, "g"), "");
}

function setAttribute(attrs: string, name: string, value: string) {
  return `${removeAttribute(attrs, name)} ${name}="${escapeXmlAttribute(value)}"`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeXmlAttribute(value: string) {
  return escapeXml(value).replace(/"/g, "&quot;");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function crc32(input: Buffer) {
  let crc = 0xffffffff;

  for (const byte of input) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

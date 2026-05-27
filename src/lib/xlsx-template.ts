import { deflateRawSync, inflateRawSync } from "node:zlib";

export type XlsxCellValue = string | number | boolean | null | undefined;

type ZipEntry = {
  name: string;
  data: Buffer;
  modTime: number;
  modDate: number;
  externalAttributes: number;
};

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

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
  worksheetUpdates: Record<string, Record<string, XlsxCellValue>>
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

  return writeZipEntries(entries);
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

  const fullMatch = xml.match(fullCellPattern);

  if (fullMatch) {
    return xml.replace(fullCellPattern, renderCell(fullMatch[0], value));
  }

  const selfClosingMatch = xml.match(selfClosingCellPattern);

  if (selfClosingMatch) {
    return xml.replace(
      selfClosingCellPattern,
      renderCell(selfClosingMatch[0], value)
    );
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

  return xml.replace(rowPattern, `${rowMatch[1]}${rowMatch[2]}${cellXml}${rowMatch[3]}`);
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

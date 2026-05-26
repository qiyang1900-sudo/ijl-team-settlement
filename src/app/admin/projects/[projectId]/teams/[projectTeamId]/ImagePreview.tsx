"use client";

import { useState } from "react";

export default function ImagePreview({
  imageUrl,
  fileName,
}: {
  imageUrl: string;
  fileName?: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="block"
      >
        <img
          src={imageUrl}
          alt={fileName || "screenshot"}
          className="h-20 w-32 rounded-lg border border-slate-700 object-cover hover:opacity-80"
        />
        <span className="mt-1 block text-xs text-slate-400 underline">
          画像を確認
        </span>
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute right-0 top-0 z-10 rounded-full bg-white px-3 py-1 text-sm font-bold text-slate-950"
            >
              ×
            </button>

            <img
              src={imageUrl}
              alt={fileName || "screenshot"}
              className="max-h-[90vh] max-w-[90vw] rounded-xl border border-slate-700 object-contain"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

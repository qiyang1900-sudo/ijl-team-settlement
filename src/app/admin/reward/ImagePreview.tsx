"use client";

/* eslint-disable @next/next/no-img-element */

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
        className="group text-left"
      >
        <img
          src={imageUrl}
          alt={fileName || "preview"}
          className="h-14 w-20 rounded-lg border border-slate-700 object-cover transition group-hover:opacity-80"
        />
        <span className="mt-1 block text-xs font-semibold text-sky-300 underline">
          查看图片
        </span>
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute right-3 top-3 z-10 rounded-full bg-white px-3 py-1 text-sm font-bold text-slate-950 shadow-lg"
            >
              ×
            </button>

            <img
              src={imageUrl}
              alt={fileName || "preview"}
              className="max-h-[90vh] max-w-[90vw] rounded-xl border border-slate-700 bg-slate-950 object-contain"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

import Link from "next/link";
import LegalLinks from "@/components/LegalLinks";
import { legalApplicationName, legalContactEmail, type LegalSection } from "@/lib/legal-documents";

export default function LegalDocument({ title, sections, showApplicationName = false }: {
  title: string; sections: LegalSection[]; showApplicationName?: boolean;
}) {
  return (
    <main lang="zh-CN" className="min-h-screen bg-[#f6f7fb] text-slate-950">
      <article className="mx-auto max-w-3xl break-words px-6 py-10 sm:py-14">
        <Link href="/" className="text-sm text-slate-600 underline underline-offset-4">IJL 战队管理系统</Link>
        <header className="mt-8 border-b border-slate-200 pb-6">
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">适用网站：IJL 战队管理系统</p>
          {showApplicationName && <p className="mt-1 text-sm leading-6 text-slate-600">Google 授权应用名称：{legalApplicationName}</p>}
        </header>
        <div className="mt-8 space-y-8">
          {sections.map(section => <section key={section.title}>
            <h2 className="text-lg font-semibold">{section.title}</h2>
            {section.paragraphs.map(paragraph => {
              const parts = paragraph.split(legalContactEmail);
              return <p key={paragraph} className="mt-3 leading-8 text-slate-700">
                {parts.map((part, index) => <span key={index}>
                  {index > 0 && <a href={`mailto:${legalContactEmail}`} className="break-all text-sky-700 underline underline-offset-4">{legalContactEmail}</a>}
                  {part}
                </span>)}
              </p>;
            })}
          </section>)}
        </div>
        <footer className="mt-10 border-t border-slate-200 pt-6"><LegalLinks className="text-slate-600" /></footer>
      </article>
    </main>
  );
}

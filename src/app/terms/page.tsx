import type { Metadata } from "next";
import LegalDocument from "@/components/LegalDocument";
import { termsSections } from "@/lib/legal-documents";

export const metadata: Metadata = { title: "使用条款 | IJL 战队管理系统" };

export default function TermsPage() {
  return <LegalDocument title="使用条款" sections={termsSections} />;
}

import type { Metadata } from "next";
import LegalDocument from "@/components/LegalDocument";
import { privacySections } from "@/lib/legal-documents";

export const metadata: Metadata = { title: "隐私说明 | IJL 战队管理系统" };

export default function PrivacyPage() {
  return <LegalDocument title="隐私说明" sections={privacySections} showApplicationName />;
}

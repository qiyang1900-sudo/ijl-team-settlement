export default function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="隐私与使用条款" className={`flex flex-wrap gap-x-5 gap-y-2 text-sm ${className}`}>
      <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">隐私说明</a>
      <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">使用条款</a>
    </nav>
  );
}

/** Gömülü PDF/XSLT gibi büyük ekleri atar (dosya küçülür, fatura bilgisi etkilenmez). Tarayıcıda da çalışır. */
export function stripAttachments(xml: string) {
  return xml.replace(
    /<([\w-]+:)?EmbeddedDocumentBinaryObject\b([^>]*?)\/?>(?:[\s\S]*?<\/([\w-]+:)?EmbeddedDocumentBinaryObject>)?/g,
    "<$1EmbeddedDocumentBinaryObject$2/>",
  );
}

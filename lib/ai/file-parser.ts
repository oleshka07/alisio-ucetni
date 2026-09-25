/**
 * Extract text content from various file types.
 * Returns extracted text for GPT to analyze.
 */
export async function extractFileText(
  base64: string,
  fileName: string,
  mimeType: string
): Promise<string | null> {
  const buffer = Buffer.from(base64, "base64");

  // PDF
  if (mimeType === "application/pdf" || fileName.endsWith(".pdf")) {
    try {
      // pdf-parse 2.x більше не експортує функцію — читаємо текст через pdfjs напряму
      const { pdfText } = await import("@/lib/bank/kb-pdf");
      return (await pdfText(buffer)).trim() || null;
    } catch (err) {
      console.error("PDF parse error:", err);
      return null;
    }
  }

  // Excel (.xlsx, .xls)
  if (
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    fileName.endsWith(".xlsx") ||
    fileName.endsWith(".xls")
  ) {
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const texts: string[] = [];
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        texts.push(`--- Sheet: ${sheetName} ---\n${csv}`);
      }
      return texts.join("\n\n").trim() || null;
    } catch (err) {
      console.error("Excel parse error:", err);
      return null;
    }
  }

  // CSV
  if (mimeType === "text/csv" || fileName.endsWith(".csv")) {
    return buffer.toString("utf-8").trim() || null;
  }

  // Plain text, JSON, XML, HTML
  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml" ||
    fileName.endsWith(".txt") ||
    fileName.endsWith(".json") ||
    fileName.endsWith(".xml")
  ) {
    return buffer.toString("utf-8").trim() || null;
  }

  // Word (.docx) - basic extraction
  if (
    mimeType.includes("wordprocessingml") ||
    mimeType.includes("msword") ||
    fileName.endsWith(".docx") ||
    fileName.endsWith(".doc")
  ) {
    try {
      // docx files are ZIP archives with XML inside
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      if (workbook.SheetNames.length > 0) {
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        return XLSX.utils.sheet_to_csv(sheet).trim() || null;
      }
    } catch {
      // Fallback: try reading as text
      const text = buffer.toString("utf-8");
      // Filter out binary noise
      const cleaned = text.replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/g, " ").replace(/\s+/g, " ").trim();
      return cleaned.length > 50 ? cleaned : null;
    }
  }

  return null;
}

"use client";

import { useState, useRef } from "react";
import { Upload, FileText, X, Loader2, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function DocumentUploadForm({
  clientId,
  uploadedBy = "accountant",
}: {
  clientId: string;
  uploadedBy?: "client" | "accountant";
}) {
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    setFile(f);
    setDone(false);
    if (!taskTitle) {
      setTaskTitle(`Zkontrolovat: ${f.name}`);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("clientId", clientId);
      formData.append("uploadedBy", uploadedBy);
      formData.append("description", description);
      formData.append("taskTitle", taskTitle || `Zkontrolovat: ${file.name}`);

      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }

      setDone(true);
      setFile(null);
      setDescription("");
      setTaskTitle("");
      toast.success("Dokument nahrán, úkol vytvořen!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Chyba při nahrávání");
    } finally {
      setUploading(false);
    }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <CheckCircle className="w-12 h-12 text-green-500" />
        <p className="font-medium text-gray-900">Dokument nahrán!</p>
        <p className="text-sm text-gray-500">Úkol byl automaticky vytvořen pro klienta.</p>
        <button
          onClick={() => setDone(false)}
          className="mt-2 text-sm text-indigo-600 hover:underline"
        >
          Nahrát další dokument
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
          dragging
            ? "border-indigo-400 bg-indigo-50"
            : file
            ? "border-green-300 bg-green-50"
            : "border-gray-200 hover:border-indigo-300 hover:bg-gray-50"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.zip"
        />
        {file ? (
          <div className="flex items-center justify-center gap-3">
            <FileText className="w-8 h-8 text-green-500" />
            <div className="text-left">
              <p className="font-medium text-gray-900 text-sm">{file.name}</p>
              <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setFile(null); setTaskTitle(""); }}
              className="ml-2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <Upload className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-700">
              Přetáhněte soubor nebo klikněte pro výběr
            </p>
            <p className="text-xs text-gray-400 mt-1">
              PDF, Word, Excel, obrázky, ZIP — max. 20 MB
            </p>
          </>
        )}
      </div>

      {/* Task title */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Název úkolu pro klienta
        </label>
        <input
          type="text"
          value={taskTitle}
          onChange={(e) => setTaskTitle(e.target.value)}
          placeholder="Např.: Podepsat a zaslat zpět"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Popis / instrukce (volitelné)
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Instrukce pro klienta..."
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={!file || uploading}
        className={cn(
          "w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors",
          file && !uploading
            ? "bg-indigo-600 text-white hover:bg-indigo-700"
            : "bg-gray-100 text-gray-400 cursor-not-allowed"
        )}
      >
        {uploading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Nahrávám...
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            Nahrát dokument a vytvořit úkol
          </>
        )}
      </button>
    </form>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { FileCheck, FileText, Upload, X, Eye, Trash2, Download, Paperclip, AlertTriangle } from 'lucide-react';
import { Worker, WorkerDocument } from '../../types';
import { ApiService } from '../../services/api';

export const DOCUMENT_TYPES: WorkerDocument['type'][] = [
  'Aadhaar / ID Card',
  'PAN Card',
  'Employment Contract',
  'Medical Fitness',
  'Bank Passbook',
  'Other',
];

const DOC_LABELS: Record<string, string> = {
  'Aadhaar / ID Card': 'Aadhaar / ID Card',
  'PAN Card': 'PAN Card',
  'Employment Contract': 'Employment Contract',
  'Medical Fitness': 'Medical Fitness Certificate',
  'Bank Passbook': 'Bank Passbook Copy',
  Other: 'Other Certificate',
};

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const MAX_BYTES = 5 * 1024 * 1024;

const formatSize = (b?: number) =>
  !b ? '' : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`;

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read file.'));
    r.readAsDataURL(file);
  });

// ===================================================================
// VIEWER: fetches protected file with JWT and previews image / PDF
// ===================================================================
export const DocumentViewerModal: React.FC<{ worker: Worker; doc: WorkerDocument; onClose: () => void }> = ({
  worker,
  doc,
  onClose,
}) => {
  const [url, setUrl] = useState<string | null>(null);
  const [mime, setMime] = useState<string>(doc.mimeType || '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    ApiService.getWorkerDocumentBlob(worker.id, doc.id)
      .then(blob => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setMime(blob.type || doc.mimeType || '');
        setUrl(objectUrl);
      })
      .catch(err => !cancelled && setError(err.message || 'Could not load document.'));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [worker.id, doc.id, doc.mimeType]);

  const isPdf = mime === 'application/pdf';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm p-2 sm:p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[95vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-800">
          <div className="min-w-0">
            <h3 className="font-bold text-sm text-white truncate">{DOC_LABELS[doc.type] || doc.type}</h3>
            <p className="text-[11px] text-slate-400 truncate">
              {worker.fullName} ({worker.employeeId}) • {doc.fileName} {doc.size ? `• ${formatSize(doc.size)}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {url && (
              <a
                href={url}
                download={doc.fileName || 'document'}
                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                title="Download"
              >
                <Download className="w-4 h-4" />
              </a>
            )}
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-[300px] bg-slate-950 flex items-center justify-center overflow-auto">
          {error ? (
            <p className="text-xs text-rose-400 flex items-center gap-2 p-6">
              <AlertTriangle className="w-4 h-4" /> {error}
            </p>
          ) : !url ? (
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          ) : isPdf ? (
            <iframe src={url} title={doc.fileName} className="w-full h-[75vh] bg-white" />
          ) : (
            <img src={url} alt={doc.fileName} className="max-w-full max-h-[80vh] object-contain" />
          )}
        </div>
      </div>
    </div>
  );
};

// ===================================================================
// LIST of uploaded documents (view + optional delete)
// ===================================================================
export const WorkerDocumentList: React.FC<{
  worker: Worker;
  onView: (doc: WorkerDocument) => void;
  onDelete?: (doc: WorkerDocument) => void;
  emptyText?: string;
}> = ({ worker, onView, onDelete, emptyText = 'No documents uploaded yet.' }) => {
  const docs = (worker.documents || []).filter(d => d.hasFile);
  if (docs.length === 0) {
    return (
      <p className="text-xs text-slate-500 p-4 bg-slate-950 rounded-lg text-center border border-slate-800">{emptyText}</p>
    );
  }
  return (
    <div className="space-y-2 max-h-56 overflow-y-auto">
      {docs.map(doc => (
        <div
          key={doc.id}
          className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between gap-2 text-xs"
        >
          <div className="flex items-center gap-2 min-w-0">
            {doc.mimeType === 'application/pdf' ? (
              <FileText className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <FileCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <div className="min-w-0">
              <div className="font-semibold text-slate-200 truncate">{DOC_LABELS[doc.type] || doc.type}</div>
              <div className="text-[11px] text-slate-500 truncate">
                {doc.fileName} • {formatSize(doc.size)} • {doc.uploadedAt}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onView(doc)}
              className="px-2 py-1 rounded-md bg-sky-950 text-sky-300 border border-sky-800 hover:bg-sky-900 flex items-center gap-1 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" /> View
            </button>
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(doc)}
                className="p-1.5 rounded-md text-slate-500 hover:text-rose-400 hover:bg-slate-800 cursor-pointer"
                title="Remove document"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

// ===================================================================
// MANAGE MODAL: select type + attach real file, list, view, delete
// ===================================================================
export const WorkerDocumentsModal: React.FC<{
  worker: Worker;
  onClose: () => void;
  onUpdated: (w: Worker) => void;
}> = ({ worker, onClose, onUpdated }) => {
  const [docType, setDocType] = useState<WorkerDocument['type']>('Aadhaar / ID Card');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<WorkerDocument | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handlePick = (f: File | null) => {
    setError(null);
    if (!f) return setFile(null);
    if (!ACCEPT.split(',').includes(f.type)) {
      setError('Only JPG, PNG, WEBP or PDF files are allowed.');
      return setFile(null);
    }
    if (f.size > MAX_BYTES) {
      setError('File too large. Maximum size is 5 MB.');
      return setFile(null);
    }
    setFile(f);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please choose a document file to attach.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const dataUrl = await readAsDataUrl(file);
      const updated = await ApiService.addWorkerDocument(worker.id, { type: docType, fileName: file.name, dataUrl });
      onUpdated(updated);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err: any) {
      setError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc: WorkerDocument) => {
    if (!confirm(`Remove "${DOC_LABELS[doc.type] || doc.type}" (${doc.fileName})?`)) return;
    try {
      onUpdated(await ApiService.deleteWorkerDocument(worker.id, doc.id));
    } catch (err: any) {
      setError(err.message || 'Delete failed.');
    }
  };

  const uploadedCount = (worker.documents || []).filter(d => d.hasFile).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-4 sm:p-6 text-white space-y-4 my-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="min-w-0">
            <h3 className="font-bold text-base text-white">Worker KYC Documents</h3>
            <p className="text-xs text-slate-400 truncate">
              {worker.fullName} ({worker.employeeId}) • Working Time: {worker.workingTime}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
            Uploaded Records ({uploadedCount})
          </span>
          <WorkerDocumentList worker={worker} onView={setViewing} onDelete={handleDelete} />
        </div>

        <form onSubmit={handleUpload} className="pt-3 border-t border-slate-800 space-y-3">
          <span className="text-xs font-semibold text-slate-300 block">Attach New Document</span>

          {error && (
            <div className="p-2.5 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          <div>
            <label className="text-[11px] font-semibold text-slate-400 block mb-1">Document Type *</label>
            <select
              value={docType}
              onChange={e => setDocType(e.target.value as WorkerDocument['type'])}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-emerald-500"
            >
              {DOCUMENT_TYPES.map(t => (
                <option key={t} value={t}>
                  {DOC_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-400 block mb-1">File * (JPG, PNG, WEBP, PDF • max 5 MB)</label>
            <label className="flex items-center gap-3 w-full bg-slate-950 border border-dashed border-slate-600 hover:border-emerald-500 rounded-lg px-3 py-3 cursor-pointer transition-colors">
              <Paperclip className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-xs text-slate-300 truncate flex-1">
                {file ? `${file.name} (${formatSize(file.size)})` : 'Tap to choose file or take photo'}
              </span>
              {file && (
                <button
                  type="button"
                  onClick={e => {
                    e.preventDefault();
                    handlePick(null);
                    if (inputRef.current) inputRef.current.value = '';
                  }}
                  className="text-slate-500 hover:text-rose-400"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={e => handlePick(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={!file || uploading}
            className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {uploading ? (
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            <span>{uploading ? 'Uploading...' : 'Upload Document'}</span>
          </button>
        </form>

        <button onClick={onClose} className="w-full py-2 bg-slate-800 text-slate-300 rounded-lg text-xs font-medium cursor-pointer">
          Close
        </button>
      </div>

      {viewing && <DocumentViewerModal worker={worker} doc={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
};

import { Calendar, CheckCircle2, Trash2, Upload } from "lucide-react";
import "../marketplace-upload.css";

export default function MarketplaceUploadCard({ item, onSelect, onRemove, dispatchDate, onDispatchDateChange, headerAction }) {
  const Icon = item.icon;
  const inputId = `marketplace-upload-${item.key}`;
  const files = item.multiple ? item.state || [] : item.state ? [item.state] : [];
  const hasFile = files.length > 0;
  const hasDate = item.key === "flipkart" && !!onDispatchDateChange;
  const description = item.description || "Upload daily orders";
  return (
    <div className="marketplace-upload-card" data-ready={hasFile} data-platform={item.key} data-has-date={hasDate} data-has-header-control={!!headerAction}>
      {hasFile && (
        <button type="button" title={`Remove ${item.title} file`} onClick={onRemove} className="marketplace-upload-remove">
          <Trash2 size={14} />
        </button>
      )}
      <div className="marketplace-upload-header">
        <label htmlFor={inputId} className="marketplace-upload-platform">
          <span className="marketplace-upload-icon">{Icon ? <Icon className="h-full w-full rounded-xl" /> : <Upload size={20} />}</span>
          <span className="marketplace-upload-copy"><span className="marketplace-upload-name">{item.title}</span><span className="marketplace-upload-description">{description}</span></span>
        </label>
        {headerAction}
        {hasDate && (
          <label className="marketplace-upload-date">
            <Calendar size={14} aria-hidden="true" />
            <input type="date" aria-label="Flipkart dispatch date" value={dispatchDate} onChange={(event) => onDispatchDateChange(event.target.value)} />
          </label>
        )}
      </div>
      <label htmlFor={inputId} className="marketplace-upload-label">
        <input id={inputId} type="file" className="marketplace-upload-input" accept={item.accept} multiple={item.multiple} aria-label={item.description ? `${item.title}: ${description}` : `Upload ${item.title} daily orders`} disabled={hasFile}
          onChange={(event) => { onSelect(item.multiple ? Array.from(event.target.files || []) : event.target.files?.[0]); event.target.value = ""; }} />
        <span className="marketplace-upload-field">
          <span className="marketplace-upload-symbol">{hasFile ? <CheckCircle2 size={22} /> : <Upload size={21} />}</span>
          {hasFile ? <span className="marketplace-upload-filename" title={files.map(file => file.name).join("\n")}>{files.length === 1 ? files[0].name : `${files.length} PDFs selected`}</span> : <span className="marketplace-upload-choose">{item.multiple ? "Choose files" : "Choose file"}</span>}
        </span>
      </label>
    </div>
  );
}

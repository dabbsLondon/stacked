import { useRef, useState } from 'react';

interface Props {
  onFiles: (files: FileList) => void;
}

export function DropZone({ onFiles }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragging(true);
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files);
  }

  return (
    <>
      <button
        type="button"
        className={`dropzone ${dragging ? 'dropzone-active' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <div className="mono dropzone-label">+ DROP GPX FILES</div>
        <div className="mono dropzone-sub">or click to browse</div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".gpx,application/gpx+xml,application/xml,text/xml"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) onFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </>
  );
}

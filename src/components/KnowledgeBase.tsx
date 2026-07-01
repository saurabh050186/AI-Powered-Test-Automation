"use client";

import React, { useState, useCallback } from "react";
import "./KnowledgeBase.css";

interface Document {
  id: string;
  name: string;
  text: string;
}

interface KBProps {
  documents: Document[];
  onAddDocument: (doc: Document) => void;
  onRemoveDocument: (id: string) => void;
}

export default function KnowledgeBase({ documents, onAddDocument, onRemoveDocument }: KBProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const handleFileUploads = useCallback(async (files: FileList | File[]) => {
    setIsUploading(true);
    let successCount = 0;
    
    try {
      const fileArray = Array.from(files);
      for (const file of fileArray) {
        setCurrentFile(file.name);
        // Simple size check (50MB)
        if (file.size > 50 * 1024 * 1024) {
          alert(`File ${file.name} is too large. Max size is 50MB.`);
          continue;
        }

        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/ingest", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errorText = await res.text();
          console.error("Server Error:", errorText);
          throw new Error(`Server returned ${res.status}: ${errorText.substring(0, 100)}...`);
        }

        const data = await res.json();

        onAddDocument({
          id: Math.random().toString(36).substr(2, 9),
          name: data.fileName,
          text: data.text
        });
        successCount++;
      }
      
      if (successCount > 0) {
        setUploadSuccess(true);
        setTimeout(() => setUploadSuccess(false), 3000);
      }
    } catch (err: any) {
      console.error("Upload error:", err);
      alert(`Upload Error: ${err.message}`);
    } finally {
      setIsUploading(false);
      setCurrentFile(null);
    }
  }, [onAddDocument]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFileUploads(files);
  }, [handleFileUploads]);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  return (
    <div className="knowledge-base">
      <div className="kb-header">
        <h3>
          <span className="kb-icon">📚</span> 
          Requirement Knowledge Base (RAG)
        </h3>
        {documents.length > 0 && (
          <span className="kb-status">
            {documents.length} document(s) attached
          </span>
        )}
      </div>

      <div className="kb-content">
        <div 
          className={`upload-zone ${isDragging ? 'dragging' : ''}`}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => document.getElementById('kb-file-input')?.click()}
        >
          <input 
            id="kb-file-input"
            type="file" 
            style={{ display: 'none' }} 
            onChange={(e) => e.target.files && handleFileUploads(e.target.files)}
            accept=".pdf,.docx,.txt,.md"
            multiple
          />
          <span className="upload-icon">📄</span>
          {isUploading ? (
            <p><span className="pulse-loader"></span> Processing: <strong>{currentFile}</strong></p>
          ) : uploadSuccess ? (
            <p style={{ color: '#4CAF50' }}><strong>✅ All Documents Uploaded Successfully!</strong></p>
          ) : (
            <p>Drag & drop PDF/Docs or <strong>Click to Upload</strong></p>
          )}
          <small>Supported: PDF, DOCX, TXT (Max 50MB per file)</small>
        </div>

        {documents.length > 0 && (
          <div className="file-list">
            {documents.map(doc => (
              <div key={doc.id} className="file-item">
                <span className="file-icon">📎</span>
                <span className="file-name">{doc.name}</span>
                <button 
                  className="remove-btn" 
                  onClick={() => onRemoveDocument(doc.id)}
                  title="Remove document"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

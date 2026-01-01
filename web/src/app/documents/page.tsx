'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';

interface DocumentType {
  id: string;
  code: string;
  name: string;
  required_for_invoice: boolean;
  required_for_pod: boolean;
}

interface Document {
  id: string;
  entity_type: string;
  entity_id: string;
  document_type: string;
  document_name: string;
  original_filename: string;
  file_url: string;
  file_size: number;
  mime_type: string;
  has_signature: boolean;
  signed_by: string;
  status: string;
  uploaded_by: string;
  uploaded_at: string;
  description: string;
}

interface Trip {
  id: string;
  trip_number: string;
  container_number: string;
  pickup_location: string;
  delivery_location: string;
  status: string;
}

export default function DocumentsPage() {
  const [activeTab, setActiveTab] = useState<'all' | 'trips' | 'upload' | 'types'>('all');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedEntityType, setSelectedEntityType] = useState<string>('TRIP');
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');
  const [selectedDocType, setSelectedDocType] = useState<string>('POD');
  const [uploadDescription, setUploadDescription] = useState('');
  const [signedBy, setSignedBy] = useState('');
  const [uploading, setUploading] = useState(false);
  
  const [filterDocType, setFilterDocType] = useState<string>('');
  const [filterEntityType, setFilterEntityType] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [viewingDocument, setViewingDocument] = useState<Document | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch document types
      const { data: typesData } = await supabase
        .from('document_types')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      setDocumentTypes(typesData || []);

      // Fetch documents
      const { data: docsData } = await supabase
        .from('documents')
        .select('*')
        .eq('status', 'ACTIVE')
        .order('uploaded_at', { ascending: false })
        .limit(100);
      setDocuments(docsData || []);

      // Fetch recent trips for document attachment
      const { data: tripsData } = await supabase
        .from('trips')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      setTrips(tripsData || []);

    } catch (err: any) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (!selectedEntityId) {
      alert('Please select a trip or entity to attach the document to');
      return;
    }

    setUploading(true);

    try {
      for (const file of Array.from(files)) {
        // For now, we'll create a data URL for demo purposes
        // In production, you'd upload to Supabase Storage
        const reader = new FileReader();
        
        await new Promise<void>((resolve, reject) => {
          reader.onload = async () => {
            const base64 = reader.result as string;
            
            // Create document record
            const { error } = await supabase.from('documents').insert({
              entity_type: selectedEntityType,
              entity_id: selectedEntityId,
              document_type: selectedDocType,
              document_name: `${selectedDocType} - ${file.name}`,
              original_filename: file.name,
              file_url: base64, // In production, this would be the storage URL
              file_size: file.size,
              mime_type: file.type,
              file_extension: file.name.split('.').pop(),
              has_signature: selectedDocType === 'POD' && signedBy ? true : false,
              signed_by: signedBy || null,
              description: uploadDescription,
              status: 'ACTIVE',
              uploaded_by: 'Admin',
            });

            if (error) throw error;
            resolve();
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
      }

      alert('Document(s) uploaded successfully!');
      setUploadDescription('');
      setSignedBy('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchData();
      setActiveTab('all');

    } catch (err: any) {
      console.error('Error:', err);
      alert('Error uploading document: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const deleteDocument = async (id: string) => {
    if (!confirm('Delete this document?')) return;

    try {
      await supabase.from('documents').update({ status: 'DELETED' }).eq('id', id);
      fetchData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const getDocTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      'BOL': '📄',
      'POD': '✅',
      'GATE_IN': '🚪',
      'GATE_OUT': '🚪',
      'WEIGHT': '⚖️',
      'CUSTOMS': '🛃',
      'DO': '📋',
      'TIR': '🔄',
      'PHOTO': '📷',
      'DAMAGE': '⚠️',
      'RECEIPT': '🧾',
      'OTHER': '📎',
    };
    return icons[type] || '📎';
  };

  const getDocTypeBadgeColor = (type: string) => {
    const colors: Record<string, string> = {
      'BOL': 'bg-blue-100 text-blue-800',
      'POD': 'bg-green-100 text-green-800',
      'GATE_IN': 'bg-purple-100 text-purple-800',
      'GATE_OUT': 'bg-purple-100 text-purple-800',
      'WEIGHT': 'bg-yellow-100 text-yellow-800',
      'CUSTOMS': 'bg-red-100 text-red-800',
      'DO': 'bg-indigo-100 text-indigo-800',
      'TIR': 'bg-cyan-100 text-cyan-800',
      'PHOTO': 'bg-pink-100 text-pink-800',
      'DAMAGE': 'bg-orange-100 text-orange-800',
      'RECEIPT': 'bg-gray-100 text-gray-800',
      'OTHER': 'bg-gray-100 text-gray-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const filteredDocuments = documents.filter(doc => {
    if (filterDocType && doc.document_type !== filterDocType) return false;
    if (filterEntityType && doc.entity_type !== filterEntityType) return false;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        doc.document_name?.toLowerCase().includes(search) ||
        doc.original_filename?.toLowerCase().includes(search) ||
        doc.description?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  // Group documents by trip
  const documentsByTrip = trips.map(trip => ({
    trip,
    documents: documents.filter(d => d.entity_type === 'TRIP' && d.entity_id === trip.id),
  })).filter(item => item.documents.length > 0);

  const requiredDocTypes = documentTypes.filter(dt => dt.required_for_invoice || dt.required_for_pod);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Document Management</h1>
          <p className="text-gray-500 mt-1">Upload and manage BOLs, PODs, gate tickets, and more</p>
        </div>
        <button
          onClick={() => setActiveTab('upload')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          + Upload Document
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-6 gap-4">
        {documentTypes.slice(0, 6).map(dt => {
          const count = documents.filter(d => d.document_type === dt.code).length;
          return (
            <div
              key={dt.code}
              onClick={() => {
                setFilterDocType(dt.code);
                setActiveTab('all');
              }}
              className="bg-white rounded-xl shadow p-4 cursor-pointer hover:shadow-lg transition"
            >
              <div className="text-2xl mb-1">{getDocTypeIcon(dt.code)}</div>
              <p className="text-sm text-gray-500">{dt.name}</p>
              <p className="text-xl font-bold">{count}</p>
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow">
        <div className="border-b px-6">
          <div className="flex gap-4">
            {[
              { id: 'all', label: 'All Documents' },
              { id: 'trips', label: 'By Trip' },
              { id: 'upload', label: 'Upload' },
              { id: 'types', label: 'Document Types' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-3 px-4 font-medium border-b-2 transition ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {/* All Documents Tab */}
          {activeTab === 'all' && (
            <div>
              {/* Filters */}
              <div className="flex gap-4 mb-6">
                <input
                  placeholder="Search documents..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="flex-1 px-4 py-2 border rounded-lg"
                />
                <select
                  value={filterDocType}
                  onChange={e => setFilterDocType(e.target.value)}
                  className="px-4 py-2 border rounded-lg"
                >
                  <option value="">All Types</option>
                  {documentTypes.map(dt => (
                    <option key={dt.code} value={dt.code}>{dt.name}</option>
                  ))}
                </select>
                <select
                  value={filterEntityType}
                  onChange={e => setFilterEntityType(e.target.value)}
                  className="px-4 py-2 border rounded-lg"
                >
                  <option value="">All Entities</option>
                  <option value="TRIP">Trips</option>
                  <option value="ORDER">Orders</option>
                  <option value="DRIVER">Drivers</option>
                  <option value="CUSTOMER">Customers</option>
                  <option value="INVOICE">Invoices</option>
                </select>
                {(filterDocType || filterEntityType || searchTerm) && (
                  <button
                    onClick={() => {
                      setFilterDocType('');
                      setFilterEntityType('');
                      setSearchTerm('');
                    }}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800"
                  >
                    Clear Filters
                  </button>
                )}
              </div>

              {/* Documents Grid */}
              <div className="grid grid-cols-4 gap-4">
                {filteredDocuments.map(doc => (
                  <div
                    key={doc.id}
                    className="border rounded-lg p-4 hover:shadow-lg transition cursor-pointer"
                    onClick={() => setViewingDocument(doc)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <span className={`px-2 py-1 rounded text-xs ${getDocTypeBadgeColor(doc.document_type)}`}>
                        {getDocTypeIcon(doc.document_type)} {doc.document_type}
                      </span>
                      {doc.has_signature && (
                        <span className="text-green-500 text-lg" title="Signed">✓</span>
                      )}
                    </div>
                    
                    <div className="mb-3">
                      {doc.mime_type?.startsWith('image/') && doc.file_url ? (
                        <img
                          src={doc.file_url}
                          alt={doc.document_name}
                          className="w-full h-24 object-cover rounded"
                        />
                      ) : (
                        <div className="w-full h-24 bg-gray-100 rounded flex items-center justify-center text-4xl">
                          {doc.mime_type?.includes('pdf') ? '📕' : '📄'}
                        </div>
                      )}
                    </div>

                    <h3 className="font-medium text-sm truncate" title={doc.document_name}>
                      {doc.document_name}
                    </h3>
                    <p className="text-xs text-gray-500 truncate">{doc.original_filename}</p>
                    <div className="flex justify-between items-center mt-2 text-xs text-gray-400">
                      <span>{formatFileSize(doc.file_size || 0)}</span>
                      <span>{new Date(doc.uploaded_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>

              {filteredDocuments.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <div className="text-6xl mb-4">📁</div>
                  <p>No documents found</p>
                </div>
              )}
            </div>
          )}

          {/* By Trip Tab */}
          {activeTab === 'trips' && (
            <div className="space-y-6">
              {documentsByTrip.map(({ trip, documents: tripDocs }) => (
                <div key={trip.id} className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                    <div>
                      <span className="font-mono font-semibold text-blue-600">{trip.trip_number}</span>
                      <span className="mx-2 text-gray-400">|</span>
                      <span className="text-gray-600">{trip.container_number}</span>
                      <span className="mx-2 text-gray-400">|</span>
                      <span className="text-sm text-gray-500">{trip.pickup_location} → {trip.delivery_location}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {requiredDocTypes.map(dt => {
                        const hasDoc = tripDocs.some(d => d.document_type === dt.code);
                        return (
                          <span
                            key={dt.code}
                            className={`px-2 py-1 rounded text-xs ${hasDoc ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
                            title={dt.name}
                          >
                            {getDocTypeIcon(dt.code)} {hasDoc ? '✓' : '✗'}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex gap-3 overflow-x-auto">
                      {tripDocs.map(doc => (
                        <div
                          key={doc.id}
                          onClick={() => setViewingDocument(doc)}
                          className="flex-shrink-0 w-32 border rounded-lg p-2 cursor-pointer hover:shadow-md transition"
                        >
                          {doc.mime_type?.startsWith('image/') && doc.file_url ? (
                            <img
                              src={doc.file_url}
                              alt={doc.document_name}
                              className="w-full h-16 object-cover rounded mb-2"
                            />
                          ) : (
                            <div className="w-full h-16 bg-gray-100 rounded flex items-center justify-center text-2xl mb-2">
                              {doc.mime_type?.includes('pdf') ? '📕' : '📄'}
                            </div>
                          )}
                          <p className="text-xs font-medium truncate">{doc.document_type}</p>
                          <p className="text-xs text-gray-500 truncate">{doc.original_filename}</p>
                        </div>
                      ))}
                      <div
                        onClick={() => {
                          setSelectedEntityId(trip.id);
                          setActiveTab('upload');
                        }}
                        className="flex-shrink-0 w-32 border-2 border-dashed rounded-lg p-2 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition flex flex-col items-center justify-center"
                      >
                        <span className="text-3xl text-gray-400">+</span>
                        <span className="text-xs text-gray-500">Add Doc</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {documentsByTrip.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <div className="text-6xl mb-4">🚛</div>
                  <p>No trips with documents yet</p>
                </div>
              )}
            </div>
          )}

          {/* Upload Tab */}
          {activeTab === 'upload' && (
            <div className="max-w-2xl mx-auto">
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Attach To</label>
                    <select
                      value={selectedEntityType}
                      onChange={e => {
                        setSelectedEntityType(e.target.value);
                        setSelectedEntityId('');
                      }}
                      className="w-full px-4 py-2 border rounded-lg"
                    >
                      <option value="TRIP">Trip</option>
                      <option value="ORDER">Order</option>
                      <option value="DRIVER">Driver</option>
                      <option value="CUSTOMER">Customer</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Select {selectedEntityType}</label>
                    <select
                      value={selectedEntityId}
                      onChange={e => setSelectedEntityId(e.target.value)}
                      className="w-full px-4 py-2 border rounded-lg"
                    >
                      <option value="">Select...</option>
                      {selectedEntityType === 'TRIP' && trips.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.trip_number} - {t.container_number}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Document Type</label>
                  <select
                    value={selectedDocType}
                    onChange={e => setSelectedDocType(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg"
                  >
                    {documentTypes.map(dt => (
                      <option key={dt.code} value={dt.code}>
                        {getDocTypeIcon(dt.code)} {dt.name}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedDocType === 'POD' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Signed By (for POD)</label>
                    <input
                      value={signedBy}
                      onChange={e => setSignedBy(e.target.value)}
                      className="w-full px-4 py-2 border rounded-lg"
                      placeholder="Name of person who signed"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-1">Description (Optional)</label>
                  <textarea
                    value={uploadDescription}
                    onChange={e => setUploadDescription(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg"
                    rows={2}
                    placeholder="Add notes about this document..."
                  />
                </div>

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition ${
                    selectedEntityId ? 'hover:border-blue-400 hover:bg-blue-50' : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                    disabled={!selectedEntityId || uploading}
                  />
                  {uploading ? (
                    <div>
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                      <p className="text-gray-600">Uploading...</p>
                    </div>
                  ) : (
                    <>
                      <div className="text-5xl mb-4">📤</div>
                      <p className="text-lg font-medium text-gray-700">
                        Click to upload or drag and drop
                      </p>
                      <p className="text-sm text-gray-500 mt-2">
                        PDF, JPG, PNG up to 10MB each
                      </p>
                    </>
                  )}
                </div>

                {!selectedEntityId && (
                  <p className="text-center text-yellow-600">
                    ⚠️ Please select a trip or entity to attach documents to
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Document Types Tab */}
          {activeTab === 'types' && (
            <div>
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Required for Invoice</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Required for POD</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Document Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {documentTypes.map(dt => {
                    const count = documents.filter(d => d.document_type === dt.code).length;
                    return (
                      <tr key={dt.code} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-sm ${getDocTypeBadgeColor(dt.code)}`}>
                            {getDocTypeIcon(dt.code)} {dt.code}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium">{dt.name}</td>
                        <td className="px-4 py-3 text-center">
                          {dt.required_for_invoice ? (
                            <span className="text-green-500">✓</span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {dt.required_for_pod ? (
                            <span className="text-green-500">✓</span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold">{count}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* View Document Modal */}
      {viewingDocument && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-75" onClick={() => setViewingDocument(null)}></div>
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
              <div className="bg-gray-800 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white">{viewingDocument.document_name}</h2>
                    <p className="text-gray-400 text-sm">{viewingDocument.original_filename}</p>
                  </div>
                  <button onClick={() => setViewingDocument(null)} className="text-white text-2xl">&times;</button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto max-h-[60vh]">
                <div className="flex gap-6">
                  <div className="flex-1">
                    {viewingDocument.mime_type?.startsWith('image/') && viewingDocument.file_url ? (
                      <img
                        src={viewingDocument.file_url}
                        alt={viewingDocument.document_name}
                        className="w-full rounded-lg shadow"
                      />
                    ) : viewingDocument.mime_type?.includes('pdf') ? (
                      <div className="bg-gray-100 rounded-lg p-12 text-center">
                        <div className="text-6xl mb-4">📕</div>
                        <p className="text-gray-600">PDF Document</p>
                        <a
                          href={viewingDocument.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-4 inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                          Open PDF
                        </a>
                      </div>
                    ) : (
                      <div className="bg-gray-100 rounded-lg p-12 text-center">
                        <div className="text-6xl mb-4">📄</div>
                        <p className="text-gray-600">Document Preview Not Available</p>
                      </div>
                    )}
                  </div>
                  
                  <div className="w-64 space-y-4">
                    <div>
                      <label className="text-xs text-gray-500">Document Type</label>
                      <p className={`px-2 py-1 rounded inline-block ${getDocTypeBadgeColor(viewingDocument.document_type)}`}>
                        {getDocTypeIcon(viewingDocument.document_type)} {viewingDocument.document_type}
                      </p>
                    </div>
                    
                    <div>
                      <label className="text-xs text-gray-500">Entity</label>
                      <p className="font-medium">{viewingDocument.entity_type}</p>
                    </div>

                    <div>
                      <label className="text-xs text-gray-500">File Size</label>
                      <p className="font-medium">{formatFileSize(viewingDocument.file_size || 0)}</p>
                    </div>

                    <div>
                      <label className="text-xs text-gray-500">Uploaded</label>
                      <p className="font-medium">{new Date(viewingDocument.uploaded_at).toLocaleString()}</p>
                    </div>

                    <div>
                      <label className="text-xs text-gray-500">Uploaded By</label>
                      <p className="font-medium">{viewingDocument.uploaded_by || '-'}</p>
                    </div>

                    {viewingDocument.has_signature && (
                      <div className="bg-green-50 p-3 rounded-lg">
                        <label className="text-xs text-green-600">Signed By</label>
                        <p className="font-medium text-green-800">{viewingDocument.signed_by}</p>
                      </div>
                    )}

                    {viewingDocument.description && (
                      <div>
                        <label className="text-xs text-gray-500">Description</label>
                        <p className="text-sm">{viewingDocument.description}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t flex justify-between">
                <button
                  onClick={() => deleteDocument(viewingDocument.id)}
                  className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                >
                  Delete
                </button>
                <div className="flex gap-2">
                  {viewingDocument.file_url && (
                    <a
                      href={viewingDocument.file_url}
                      download={viewingDocument.original_filename}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Download
                    </a>
                  )}
                  <button
                    onClick={() => setViewingDocument(null)}
                    className="px-4 py-2 border rounded-lg hover:bg-gray-100"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

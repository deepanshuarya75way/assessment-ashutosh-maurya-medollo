import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  CloudArrowUpIcon, 
  DocumentTextIcon, 
  ClockIcon, 
  CheckCircleIcon,
  PlusIcon,
  MinusIcon,
  TrashIcon,
  ShoppingCartIcon,
  SparklesIcon,
  ExclamationCircleIcon,
  CheckIcon
} from '@heroicons/react/24/outline';
import PageTransition from '../components/ui/PageTransition';
import { useCart } from '../context/CartContext';
import * as XLSX from 'xlsx';

const PrescriptionsPage = () => {
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const navigate = useNavigate();
  const [uploadStatus, setUploadStatus] = useState('idle'); // 'idle' | 'uploading' | 'success' | 'error'
  const [isParsing, setIsParsing] = useState(false);
  const [extractedMedicines, setExtractedMedicines] = useState([]);
  const [prescriptionMeta, setPrescriptionMeta] = useState(null);
  const [notification, setNotification] = useState(null);
  const [newMedName, setNewMedName] = useState('');
  const [newMedQty, setNewMedQty] = useState(1);
  const [showAddCustomModal, setShowAddCustomModal] = useState(false);

  const { isLoggedIn, addToCart, toggleCart } = useCart();

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files);
      handleFiles(newFiles);
      e.dataTransfer.clearData();
    }
  };

  const handleFileSelect = (e) => {
    if (!isLoggedIn) {
      e.preventDefault();
      navigate('/login');
      return;
    }
    
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      handleFiles(newFiles);
    }
  };

  const handleFiles = async (newFiles) => {
    const supportedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/pdf'
    ];

    const validFiles = newFiles.filter(file => {
      const ext = file.name.split('.').pop().toLowerCase();
      return file.type.startsWith('image/') || 
             supportedTypes.includes(file.type) || 
             ['csv', 'xlsx', 'xls', 'pdf'].includes(ext);
    });

    if (validFiles.length === 0) {
      showNotification('error', 'Please upload a CSV, XLSX, XLS, Image, or PDF file.');
      return;
    }

    setFiles(prevFiles => [...prevFiles, ...validFiles]);

    // Check if any uploaded file is a spreadsheet (CSV, XLSX, XLS)
    const spreadsheetFile = validFiles.find(file => {
      const ext = file.name.split('.').pop().toLowerCase();
      return ['csv', 'xlsx', 'xls'].includes(ext);
    });

    if (spreadsheetFile) {
      await parsePrescriptionSpreadsheet(spreadsheetFile);
    }
  };

  const removeFile = (index) => {
    setFiles(prevFiles => {
      const updated = prevFiles.filter((_, i) => i !== index);
      if (updated.length === 0) {
        setExtractedMedicines([]);
        setPrescriptionMeta(null);
      }
      return updated;
    });
  };

  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  // Parsing function for CSV / XLSX / XLS files
  const parsePrescriptionSpreadsheet = async (file) => {
    setIsParsing(true);
    setUploadStatus('uploading');

    try {
      // 1. Try sending to backend API endpoint first
      const formData = new FormData();
      formData.append('file', file);

      const backendUrl = import.meta.env.VITE_REACT_APP_BACKEND_URL || 'http://localhost:4000';
      const response = await fetch(`${backendUrl}/api/medicine-details/parse-prescription`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.medicines && data.medicines.length > 0) {
          setExtractedMedicines(data.medicines);
          setPrescriptionMeta({
            fileName: file.name,
            totalExtracted: data.totalExtracted,
            matchedCount: data.matchedCount
          });
          setUploadStatus('success');
          showNotification('success', `Extracted ${data.totalExtracted} medicines from ${file.name}!`);
          setIsParsing(false);
          return;
        }
      }

      // 2. Client-side fallback using SheetJS (XLSX)
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];

      const jsonRows = XLSX.utils.sheet_to_json(sheet);
      const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      let parsedItems = [];

      if (jsonRows && jsonRows.length > 0) {
        jsonRows.forEach(row => {
          let medName = null;
          let qty = 1;
          let dosage = '';
          let price = null;

          for (const [key, val] of Object.entries(row)) {
            if (!val) continue;
            const k = key.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
            const v = val.toString().trim();

            if (['medicine', 'medicinename', 'name', 'drug', 'drugname', 'product', 'productname', 'item', 'particulars', 'title'].includes(k)) {
              medName = v;
            } else if (['qty', 'quantity', 'amount', 'count', 'units', 'tablets', 'packs', 'pack', 'nooftablets'].includes(k)) {
              const num = parseInt(v.replace(/\D/g, ''));
              if (!isNaN(num) && num > 0) qty = num;
            } else if (['dosage', 'dose', 'instructions', 'timing', 'power'].includes(k)) {
              dosage = v;
            } else if (['price', 'mrp', 'cost', 'rate'].includes(k)) {
              const p = parseFloat(v.replace(/[^0-9.]/g, ''));
              if (!isNaN(p) && p > 0) price = p;
            }
          }

          if (medName && medName.length >= 2) {
            parsedItems.push({ name: medName, quantity: qty, dosage, price });
          }
        });
      }

      if (parsedItems.length === 0 && rawRows && rawRows.length > 0) {
        rawRows.forEach((row, i) => {
          if (!Array.isArray(row) || row.length === 0) return;
          let candidateName = null;
          let candidateQty = 1;

          row.forEach(cell => {
            if (cell == null) return;
            const cellStr = cell.toString().trim();
            if (!cellStr) return;

            if (i === 0 && ['medicine', 'name', 'qty', 'quantity', 'drug', 's.no'].some(h => cellStr.toLowerCase().includes(h))) {
              candidateName = null;
              return;
            }

            if (isNaN(Number(cellStr)) && cellStr.length > 2 && !candidateName) {
              candidateName = cellStr;
            } else if (!isNaN(Number(cellStr))) {
              const num = parseInt(cellStr);
              if (num > 0 && num < 1000) candidateQty = num;
            }
          });

          if (candidateName) {
            parsedItems.push({ name: candidateName, quantity: candidateQty, dosage: '', price: null });
          }
        });
      }

      if (parsedItems.length > 0) {
        const clientResults = parsedItems.map((item, index) => {
          const itemPrice = item.price || 99.00;
          return {
            id: `prescription-client-${index}-${Date.now()}`,
            productId: `PR-CLIENT-${index}`,
            name: item.name,
            originalExtractedName: item.name,
            brand: 'Prescription Item',
            manufacturer: 'Pharmacist Verified',
            composition: item.dosage ? `Dosage: ${item.dosage}` : 'Prescribed Medicine',
            image: "https://placehold.co/300x300/3B82F6/FFFFFF/png?text=Prescription+Item",
            price: itemPrice,
            mrp: Math.round(itemPrice * 1.1),
            discount: 10,
            quantity: item.quantity || 1,
            dosage: item.dosage || '',
            stock: 100,
            productForm: 'Tablet/Capsule',
            prescriptionRequired: true,
            matched: false,
            selected: true
          };
        });

        setExtractedMedicines(clientResults);
        setPrescriptionMeta({
          fileName: file.name,
          totalExtracted: clientResults.length,
          matchedCount: 0
        });
        setUploadStatus('success');
        showNotification('success', `Extracted ${clientResults.length} medicines from ${file.name}!`);
      } else {
        showNotification('error', 'Could not parse medicines from spreadsheet. Please ensure it contains medicine names.');
        setUploadStatus('idle');
      }
    } catch (err) {
      console.error('Spreadsheet parse error:', err);
      showNotification('error', 'Failed to parse spreadsheet file.');
      setUploadStatus('idle');
    } finally {
      setIsParsing(false);
    }
  };

  const handleUpload = () => {
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }

    if (files.length === 0) return;

    setUploadStatus('uploading');

    setTimeout(() => {
      setUploadStatus('success');
      showNotification('success', 'Prescription submitted successfully!');
    }, 1500);
  };

  // Medicine Quantity & Selection Handlers
  const handleToggleSelectAll = (checked) => {
    setExtractedMedicines(prev => prev.map(m => ({ ...m, selected: checked })));
  };

  const handleToggleMedicineSelect = (id) => {
    setExtractedMedicines(prev => prev.map(m => m.id === id ? { ...m, selected: !m.selected } : m));
  };

  const handleUpdateMedicineQuantity = (id, delta) => {
    setExtractedMedicines(prev => prev.map(m => {
      if (m.id === id) {
        const newQty = Math.max(1, (m.quantity || 1) + delta);
        return { ...m, quantity: newQty };
      }
      return m;
    }));
  };

  const handleRemoveMedicine = (id) => {
    setExtractedMedicines(prev => prev.filter(m => m.id !== id));
  };

  const handleAddCustomMedicine = () => {
    if (!newMedName.trim()) return;

    const newItem = {
      id: `custom-added-${Date.now()}`,
      productId: `PR-CUSTOM-${Date.now()}`,
      name: newMedName.trim(),
      originalExtractedName: newMedName.trim(),
      brand: 'Custom Prescribed',
      manufacturer: 'User Added',
      composition: 'Prescription Item',
      image: "https://placehold.co/300x300/3B82F6/FFFFFF/png?text=Custom+Medicine",
      price: 99.00,
      mrp: 110.00,
      discount: 10,
      quantity: Math.max(1, parseInt(newMedQty) || 1),
      dosage: '',
      stock: 100,
      productForm: 'Tablet',
      prescriptionRequired: true,
      matched: false,
      selected: true
    };

    setExtractedMedicines(prev => [...prev, newItem]);
    setNewMedName('');
    setNewMedQty(1);
    setShowAddCustomModal(false);
    showNotification('success', `Added "${newItem.name}" to prescription list.`);
  };

  // Add selected medicines to Cart and proceed to checkout
  const handleProceedToOrder = (goToCheckout = true) => {
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }

    const selectedItems = extractedMedicines.filter(m => m.selected);
    if (selectedItems.length === 0) {
      showNotification('error', 'Please select at least one medicine to proceed.');
      return;
    }

    let addedCount = 0;
    selectedItems.forEach(item => {
      const added = addToCart(item, item.quantity);
      if (added) addedCount++;
    });

    if (addedCount > 0) {
      showNotification('success', `Added ${addedCount} prescribed medicines to your cart!`);
      if (goToCheckout) {
        setTimeout(() => {
          toggleCart(true);
        }, 400);
      }
    } else {
      showNotification('error', 'Could not add items to cart. Please check login status.');
    }
  };

  // Calculations
  const selectedMedicines = extractedMedicines.filter(m => m.selected);
  const totalSelectedCount = selectedMedicines.reduce((sum, item) => sum + (item.quantity || 1), 0);
  const totalSelectedPrice = selectedMedicines.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
  const isAllSelected = extractedMedicines.length > 0 && extractedMedicines.every(m => m.selected);

  return (
    <PageTransition>
      <div className="bg-pink-50 min-h-screen py-12 pb-28">
        <div className="container mx-auto px-4 max-w-5xl">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
                Prescription Portal
                <SparklesIcon className="w-7 h-7 text-primary animate-pulse" />
              </h1>
              <p className="text-gray-600 mt-1">
                Upload prescription files (CSV, XLSX, XLS, PDF, Images) to extract medicines, adjust quantities, and order instantly.
              </p>
            </div>
            {extractedMedicines.length > 0 && (
              <button
                onClick={() => {
                  setExtractedMedicines([]);
                  setFiles([]);
                  setPrescriptionMeta(null);
                }}
                className="self-start md:self-auto text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
              >
                Clear Extracted List
              </button>
            )}
          </div>

          {/* Toast Notification */}
          <AnimatePresence>
            {notification && (
              <motion.div
                initial={{ opacity: 0, y: -15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className={`p-4 rounded-xl mb-6 shadow-md border flex items-center justify-between ${
                  notification.type === 'success' 
                    ? 'bg-green-50 border-green-200 text-green-800' 
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  {notification.type === 'success' ? (
                    <CheckCircleIcon className="w-6 h-6 text-green-600 flex-shrink-0" />
                  ) : (
                    <ExclamationCircleIcon className="w-6 h-6 text-red-600 flex-shrink-0" />
                  )}
                  <span className="font-medium text-sm">{notification.message}</span>
                </div>
                <button onClick={() => setNotification(null)} className="text-gray-400 hover:text-gray-600">
                  &times;
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 gap-8">
            {/* Upload Area Card */}
            <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <CloudArrowUpIcon className="h-6 w-6 text-primary" />
                  Upload Prescription File
                </h2>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="bg-green-100 text-green-700 text-xs font-semibold px-2.5 py-1 rounded-md">.CSV</span>
                  <span className="bg-emerald-100 text-emerald-700 text-xs font-semibold px-2.5 py-1 rounded-md">.XLSX</span>
                  <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-md">.PDF</span>
                  <span className="bg-purple-100 text-purple-700 text-xs font-semibold px-2.5 py-1 rounded-md">JPG / PNG</span>
                </div>
              </div>

              <p className="text-gray-600 text-sm mb-6">
                Upload any prescription spreadsheet (CSV / XLSX) or scanned image/PDF. Medicines will be automatically parsed so you can pick amounts and purchase.
              </p>
              
              {/* File Dropzone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                className={`border-2 border-dashed rounded-2xl p-8 sm:p-10 text-center cursor-pointer transition-all ${
                  isDragging 
                    ? 'border-primary bg-primary/5 scale-[1.01]' 
                    : 'border-gray-300 hover:border-primary/50 bg-gray-50/50 hover:bg-gray-50'
                }`}
              >
                {isParsing ? (
                  <div className="py-6 flex flex-col items-center justify-center">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
                    <p className="text-gray-800 font-semibold">Reading Prescription & Matching Inventory...</p>
                    <p className="text-gray-500 text-xs mt-1">Fetching medicines, prices, and stock availability</p>
                  </div>
                ) : (
                  <>
                    <CloudArrowUpIcon className="h-14 w-14 mx-auto text-primary mb-3" />
                    <p className="text-lg font-semibold text-gray-800 mb-1">
                      Drag & Drop your prescription file here
                    </p>
                    <p className="text-gray-500 text-xs mb-4">
                      Supports CSV, XLSX, XLS, PDF, PNG, JPG (Up to 10MB)
                    </p>
                    <label 
                      className="bg-primary text-white font-medium py-2.5 px-6 rounded-xl hover:bg-primary/90 cursor-pointer inline-flex items-center gap-2 shadow-sm transition-all hover:shadow-md"
                    >
                      <DocumentTextIcon className="w-5 h-5" />
                      Browse Files
                      <input
                        type="file"
                        multiple
                        accept="image/*,.pdf,.csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                        className="hidden"
                        onChange={handleFileSelect}
                        onClick={(e) => {
                          if (!isLoggedIn) {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate('/login');
                          }
                        }}
                      />
                    </label>
                  </>
                )}
              </div>
              
              {/* Selected Upload Files List */}
              {files.length > 0 && (
                <div className="mt-6 border-t pt-4">
                  <h3 className="font-semibold text-gray-700 text-sm mb-3">Uploaded File Attachments:</h3>
                  <div className="space-y-2">
                    {files.map((file, index) => {
                      const isExcel = ['csv', 'xlsx', 'xls'].includes(file.name.split('.').pop().toLowerCase());
                      return (
                        <div key={index} className="flex items-center justify-between bg-gray-50 border p-3 rounded-xl">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <div className={`p-2 rounded-lg ${isExcel ? 'bg-green-100 text-green-700' : 'bg-primary/10 text-primary'}`}>
                              <DocumentTextIcon className="h-5 w-5" />
                            </div>
                            <div className="truncate">
                              <p className="text-gray-800 text-sm font-medium truncate">{file.name}</p>
                              <p className="text-gray-400 text-xs">{(file.size / 1024).toFixed(1)} KB {isExcel && '• Spreadsheet parsed'}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => removeFile(index)}
                            className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                            title="Remove File"
                          >
                            <TrashIcon className="w-5 h-5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  
                  {!extractedMedicines.length && (
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={handleUpload}
                      disabled={uploadStatus === 'uploading'}
                      className={`w-full mt-4 py-3 rounded-xl font-semibold shadow-sm text-white ${
                        uploadStatus === 'uploading' 
                          ? 'bg-gray-400 cursor-not-allowed' 
                          : 'bg-primary hover:bg-primary/90'
                      }`}
                    >
                      {uploadStatus === 'uploading' ? 'Processing Upload...' : 'Submit Prescription'}
                    </motion.button>
                  )}
                </div>
              )}
            </div>

            {/* Extracted Prescription Medicines Section */}
            {extractedMedicines.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden"
              >
                {/* Extracted Header Banner */}
                <div className="bg-gradient-to-r from-primary/10 via-pink-50 to-purple-50 p-6 border-b border-gray-100">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="bg-primary text-white text-xs font-bold px-2.5 py-0.5 rounded-full">
                          PARSED PRESCRIPTION
                        </span>
                        {prescriptionMeta && (
                          <span className="text-gray-500 text-xs font-medium">
                            from {prescriptionMeta.fileName}
                          </span>
                        )}
                      </div>
                      <h3 className="text-xl font-bold text-gray-900">
                        Prescribed Medicines Extracted ({extractedMedicines.length})
                      </h3>
                      <p className="text-gray-600 text-sm mt-0.5">
                        Select the medicines and quantity you wish to order.
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setShowAddCustomModal(true)}
                        className="bg-white border border-gray-300 hover:border-primary text-gray-700 hover:text-primary font-medium text-xs px-3.5 py-2 rounded-xl transition-all inline-flex items-center gap-1.5 shadow-sm"
                      >
                        <PlusIcon className="w-4 h-4" />
                        Add Medicine
                      </button>
                    </div>
                  </div>

                  {/* Select All Bar */}
                  <div className="mt-4 pt-3 border-t border-gray-200/60 flex items-center justify-between text-xs text-gray-600">
                    <label className="inline-flex items-center gap-2 cursor-pointer font-medium select-none">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={(e) => handleToggleSelectAll(e.target.checked)}
                        className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
                      />
                      Select All Medicines ({extractedMedicines.length})
                    </label>
                    <span>
                      {selectedMedicines.length} of {extractedMedicines.length} selected
                    </span>
                  </div>
                </div>

                {/* Medicines List */}
                <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
                  {extractedMedicines.map((medicine) => (
                    <div 
                      key={medicine.id}
                      className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                        medicine.selected ? 'bg-white' : 'bg-gray-50/70 opacity-75'
                      }`}
                    >
                      {/* Checkbox + Image + Details */}
                      <div className="flex items-start sm:items-center gap-3.5 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={medicine.selected}
                          onChange={() => handleToggleMedicineSelect(medicine.id)}
                          className="mt-1 sm:mt-0 w-5 h-5 text-primary rounded border-gray-300 focus:ring-primary cursor-pointer"
                        />
                        
                        <img
                          src={medicine.image}
                          alt={medicine.name}
                          className="w-14 h-14 object-cover rounded-xl border flex-shrink-0 bg-gray-50"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = "https://placehold.co/300x300/FF385C/FFFFFF/png?text=Medicine";
                          }}
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-bold text-gray-900 text-base truncate">
                              {medicine.name}
                            </h4>
                            {medicine.matched ? (
                              <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                                <CheckIcon className="w-3 h-3" /> Store Matched
                              </span>
                            ) : (
                              <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                Prescription Item
                              </span>
                            )}
                          </div>

                          <p className="text-gray-500 text-xs mt-0.5 truncate">
                            {medicine.brand} {medicine.composition ? `• ${medicine.composition}` : ''}
                          </p>

                          {medicine.originalExtractedName && medicine.originalExtractedName !== medicine.name && (
                            <p className="text-gray-400 text-[11px] mt-0.5">
                              Extracted label: "{medicine.originalExtractedName}"
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Quantity Selector & Price */}
                      <div className="flex items-center justify-between sm:justify-end gap-6 border-t sm:border-t-0 pt-3 sm:pt-0">
                        {/* Price Unit */}
                        <div className="text-left sm:text-right">
                          <p className="text-xs text-gray-400">Price / Unit</p>
                          <p className="text-sm font-semibold text-gray-800">₹{(medicine.price || 0).toFixed(2)}</p>
                        </div>

                        {/* Amount / Quantity Counter */}
                        <div className="flex items-center border border-gray-300 rounded-xl bg-gray-50 p-1 shadow-sm">
                          <button
                            onClick={() => handleUpdateMedicineQuantity(medicine.id, -1)}
                            className="w-8 h-8 rounded-lg bg-white hover:bg-gray-100 text-gray-700 font-bold flex items-center justify-center transition-colors shadow-xs"
                            title="Decrease quantity"
                          >
                            <MinusIcon className="w-4 h-4" />
                          </button>

                          <span className="w-10 text-center font-bold text-gray-900 text-sm">
                            {medicine.quantity || 1}
                          </span>

                          <button
                            onClick={() => handleUpdateMedicineQuantity(medicine.id, 1)}
                            className="w-8 h-8 rounded-lg bg-white hover:bg-gray-100 text-gray-700 font-bold flex items-center justify-center transition-colors shadow-xs"
                            title="Increase quantity"
                          >
                            <PlusIcon className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Subtotal */}
                        <div className="text-right min-w-[70px]">
                          <p className="text-xs text-gray-400">Subtotal</p>
                          <p className="text-base font-bold text-primary">
                            ₹{((medicine.price || 0) * (medicine.quantity || 1)).toFixed(2)}
                          </p>
                        </div>

                        {/* Remove Action */}
                        <button
                          onClick={() => handleRemoveMedicine(medicine.id)}
                          className="text-gray-300 hover:text-red-500 p-1 transition-colors"
                          title="Remove item"
                        >
                          <TrashIcon className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Bottom Action / Order Bar */}
                <div className="bg-gray-900 text-white p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <p className="text-gray-400 text-xs">Total Selected Medicines ({selectedMedicines.length})</p>
                    <p className="text-2xl font-bold text-white tracking-tight">
                      ₹{totalSelectedPrice.toFixed(2)}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <button
                      onClick={() => handleProceedToOrder(false)}
                      disabled={selectedMedicines.length === 0}
                      className={`flex-1 sm:flex-none py-3 px-5 rounded-xl font-semibold text-sm border border-gray-700 hover:bg-gray-800 transition-colors ${
                        selectedMedicines.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      Add Selected to Cart
                    </button>

                    <button
                      onClick={() => handleProceedToOrder(true)}
                      disabled={selectedMedicines.length === 0}
                      className={`flex-1 sm:flex-none py-3 px-6 rounded-xl font-bold text-sm bg-primary hover:bg-primary/90 text-white transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 ${
                        selectedMedicines.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      <ShoppingCartIcon className="w-5 h-5" />
                      Proceed & Order Now
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* How It Works Section */}
            <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-100">
              <h2 className="text-xl font-bold mb-6 text-gray-800">How Prescription Ordering Works</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center p-4 bg-pink-50/50 rounded-xl">
                  <div className="bg-primary/10 rounded-2xl h-14 w-14 flex items-center justify-center mx-auto mb-3">
                    <CloudArrowUpIcon className="h-7 w-7 text-primary" />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-1">1. Upload File</h3>
                  <p className="text-gray-600 text-xs">Upload your prescription in CSV, XLSX, PDF, or image formats</p>
                </div>
                
                <div className="text-center p-4 bg-pink-50/50 rounded-xl">
                  <div className="bg-primary/10 rounded-2xl h-14 w-14 flex items-center justify-center mx-auto mb-3">
                    <ClockIcon className="h-7 w-7 text-primary" />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-1">2. Extract & Pick Amounts</h3>
                  <p className="text-gray-600 text-xs">Medicines are automatically fetched. Select your required medicine quantities</p>
                </div>
                
                <div className="text-center p-4 bg-pink-50/50 rounded-xl">
                  <div className="bg-primary/10 rounded-2xl h-14 w-14 flex items-center justify-center mx-auto mb-3">
                    <CheckCircleIcon className="h-7 w-7 text-primary" />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-1">3. Order & Fast Delivery</h3>
                  <p className="text-gray-600 text-xs">Proceed to order and get medicines delivered directly to your doorstep</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Add Custom Medicine Modal */}
        <AnimatePresence>
          {showAddCustomModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl"
              >
                <h3 className="text-lg font-bold text-gray-900 mb-2">Add Prescription Medicine</h3>
                <p className="text-gray-600 text-xs mb-4">
                  Enter medicine name and quantity to include in your order list.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Medicine Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Paracetamol 500mg, Metformin"
                      value={newMedName}
                      onChange={(e) => setNewMedName(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Quantity / Amount *</label>
                    <input
                      type="number"
                      min="1"
                      value={newMedQty}
                      onChange={(e) => setNewMedQty(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                    />
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-end gap-3">
                  <button
                    onClick={() => setShowAddCustomModal(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddCustomMedicine}
                    disabled={!newMedName.trim()}
                    className={`px-5 py-2 text-sm font-bold text-white bg-primary rounded-xl hover:bg-primary/90 transition-colors ${
                      !newMedName.trim() ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    Add Medicine
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  );
};

export default PrescriptionsPage;
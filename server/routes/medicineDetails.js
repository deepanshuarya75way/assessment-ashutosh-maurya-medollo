const express = require('express');
const router = express.Router();
const Medicine = require('../models/Medicine');
const XLSX = require('xlsx');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage() });

// Helper to extract medicines from XLSX/CSV sheet
function extractMedicinesFromSheet(sheet) {
  const jsonRows = XLSX.utils.sheet_to_json(sheet);
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const items = [];

  // Method 1: Check json object keys for header-based mapping
  if (jsonRows && jsonRows.length > 0) {
    for (const row of jsonRows) {
      let medName = null;
      let qty = 1;
      let dosage = '';
      let price = null;

      for (const [key, val] of Object.entries(row)) {
        if (!val) continue;
        const k = key.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
        const v = val.toString().trim();

        if (['medicine', 'medicinename', 'name', 'drug', 'drugname', 'product', 'productname', 'item', 'particulars', 'title', 'description'].includes(k)) {
          medName = v;
        } else if (['qty', 'quantity', 'amount', 'count', 'units', 'tablets', 'packs', 'pack', 'nooftablets'].includes(k)) {
          const parsedQty = parseInt(v.replace(/\D/g, ''));
          if (!isNaN(parsedQty) && parsedQty > 0) qty = parsedQty;
        } else if (['dosage', 'dose', 'instructions', 'timing', 'power', 'frequency'].includes(k)) {
          dosage = v;
        } else if (['price', 'mrp', 'cost', 'rate'].includes(k)) {
          const parsedPrice = parseFloat(v.replace(/[^0-9.]/g, ''));
          if (!isNaN(parsedPrice) && parsedPrice > 0) price = parsedPrice;
        }
      }

      if (medName && medName.length >= 2) {
        items.push({ name: medName, quantity: qty, dosage, price });
      }
    }
  }

  // Method 2: If header-based extraction found nothing, process raw 2D rows
  if (items.length === 0 && rawRows && rawRows.length > 0) {
    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!Array.isArray(row) || row.length === 0) continue;

      let candidateName = null;
      let candidateQty = 1;

      for (const cell of row) {
        if (cell == null) continue;
        const cellStr = cell.toString().trim();
        if (!cellStr) continue;

        // Skip headers line if row 0
        if (i === 0 && ['medicine', 'name', 'qty', 'quantity', 'drug', 's.no', 'sr.no'].some(h => cellStr.toLowerCase().includes(h))) {
          candidateName = null;
          break;
        }

        if (isNaN(Number(cellStr)) && cellStr.length > 2 && !candidateName) {
          candidateName = cellStr;
        } else if (!isNaN(Number(cellStr))) {
          const num = parseInt(cellStr);
          if (num > 0 && num < 1000) candidateQty = num;
        }
      }

      if (candidateName) {
        items.push({ name: candidateName, quantity: candidateQty, dosage: '', price: null });
      }
    }
  }

  return items;
}

// @route   GET /api/medicine-details/paginated
// @desc    Get paginated medicines with filtering and sorting
// @access  Public
router.get('/paginated', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      category = 'all',
      search = '',
      sortBy = 'name',
      priceMin = 0,
      priceMax = 10000,
      prescription = 'all'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build match stage for filtering
    // Show medicines that are not explicitly disabled
    // This will include medicines where these fields don't exist (manually added)
    let matchStage = {
      isActive: { $ne: false }, // Show if not explicitly false (includes undefined/null/true)
      isSellable: { $ne: 'N' } // Show if not explicitly 'N' (includes undefined/null/'Y')
    };

    // Add category filter or product form filter
    if (category !== 'all') {
      if (category.startsWith('form-')) {
        // Filter by product form name
        const productForm = category.replace('form-', '');
        matchStage.productFormName = productForm;
      } else {
        // Filter by category
        matchStage.category = category;
      }
    }

    // Add search filter
    if (search && search.trim()) {
      matchStage.$or = [
        { productName: { $regex: search.trim(), $options: 'i' } },
        { compositionName: { $regex: search.trim(), $options: 'i' } },
        { molecules: { $regex: search.trim(), $options: 'i' } },
        { brand: { $regex: search.trim(), $options: 'i' } }
      ];
    }

    // Add price range filter
    matchStage.displayPrice = {
      $gte: parseFloat(priceMin),
      $lte: parseFloat(priceMax)
    };

    // Add prescription filter
    if (prescription !== 'all') {
      matchStage.isPrescriptionRequired = prescription === 'required' ? 'Y' : 'N';
    }

    // Build sorting
    let sortStage = {};
    switch (sortBy) {
      case 'price-low':
        sortStage = { displayPrice: 1 };
        break;
      case 'price-high':
        sortStage = { displayPrice: -1 };
        break;
      case 'rating':
        sortStage = { rating: -1 };
        break;
      case 'name':
        sortStage = { productName: 1 };
        break;
      case 'newest':
        sortStage = { createdAt: -1 };
        break;
      default:
        sortStage = { productName: 1 };
        break;
    }

    // Get total count for pagination
    const total = await Medicine.countDocuments(matchStage);

    // Execute query with pagination
    const medicines = await Medicine.find(matchStage)
      .sort(sortStage)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Process the results to match frontend format
    const processedMedicines = medicines.map((medicine, index) => {
      // Calculate MRP as 10% higher than display price
      const sellingPrice = medicine.displayPrice;
      const calculatedMrp = sellingPrice * 1.1;
      const discount = 10; // Fixed 10% discount
      
      return {
        id: medicine._id,
        productId: medicine.productId,
        name: medicine.productName,
        brand: medicine.brand,
        manufacturer: medicine.manufacturer,
        composition: medicine.compositionName,
        molecules: medicine.molecules,
        image: medicine.imageUrl || "https://placehold.co/300x300/FF385C/FFFFFF/png?text=Medicine",
        price: sellingPrice, // This is our selling price
        mrp: calculatedMrp, // MRP is 10% higher
        discount: discount, // Fixed 10% discount
        perUnitPrice: medicine.perUnitPrice,
        rating: medicine.rating || (Math.random() * (5 - 3.5) + 3.5).toFixed(1),
        reviews: Math.floor(Math.random() * 200) + 5,
        category: medicine.category,
        stock: medicine.stock,
        tags: medicine.tags,
        packSize: medicine.packSize,
        productForm: medicine.productFormName,
        prescriptionRequired: medicine.isPrescriptionRequired === 'Y',
        countryOfOrigin: medicine.countryOfOrigin,
        description: medicine.productLongDescription || medicine.compositionName
      };
    });

    const totalPages = Math.ceil(total / limitNum);

    res.json({
      success: true,
      data: processedMedicines,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalItems: total,
        itemsPerPage: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });

  } catch (error) {
    console.error('Error fetching paginated medicines:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/medicine-details/categories
// @desc    Get all available categories and product forms
// @access  Public
router.get('/categories', async (req, res) => {
  try {
    const categories = await Medicine.distinct('category').then(cats => cats.filter(c => c)); // Filter out null/undefined
    const productForms = await Medicine.distinct('productFormName').then(forms => forms.filter(f => f)); // Filter out null/undefined
    
    const categoryList = [
      { id: "all", name: "All Products", type: "special" }
    ];

    // Add product form filters
    if (productForms.length > 0) {
      categoryList.push({ id: "divider-forms", name: "Product Forms", type: "divider" });
      productForms.forEach(form => {
        if (form) {
          categoryList.push({
            id: `form-${form}`,
            name: form,
            type: "productForm"
          });
        }
      });
    }

    // Add categories if they exist
    if (categories.length > 0) {
      categoryList.push({ id: "divider-categories", name: "Categories", type: "divider" });
      categories.forEach(category => {
        if (category) {
          categoryList.push({
            id: category,
            name: category,
            type: "category"
          });
        }
      });
    }

    res.json({
      success: true,
      categories: categoryList
    });

  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/medicine-details/:id
// @desc    Get single medicine details
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const medicine = await Medicine.findById(req.params.id);
    
    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found'
      });
    }

    // Calculate MRP as 10% higher than display price
    const sellingPrice = medicine.displayPrice;
    const calculatedMrp = sellingPrice * 1.1;
    const discount = 10; // Fixed 10% discount

    const processedMedicine = {
      id: medicine._id,
      productId: medicine.productId,
      name: medicine.productName,
      brand: medicine.brand,
      manufacturer: medicine.manufacturer,
      composition: medicine.compositionName,
      molecules: medicine.molecules,
      image: medicine.imageUrl || "https://placehold.co/300x300/FF385C/FFFFFF/png?text=Medicine",
      price: sellingPrice, // This is our selling price
      mrp: calculatedMrp, // MRP is 10% higher
      discount: discount, // Fixed 10% discount
      perUnitPrice: medicine.perUnitPrice,
      rating: medicine.rating || (Math.random() * (5 - 3.5) + 3.5).toFixed(1),
      reviews: Math.floor(Math.random() * 200) + 5,
      category: medicine.category,
      stock: medicine.stock,
      tags: medicine.tags,
      packSize: medicine.packSize,
      productForm: medicine.productFormName,
      prescriptionRequired: medicine.isPrescriptionRequired === 'Y',
      countryOfOrigin: medicine.countryOfOrigin,
      description: medicine.productLongDescription || medicine.compositionName,
      auditForm: medicine.auditForm,
      packaging: medicine.packaging,
      saleUnit: medicine.saleUnit,
      switchProductIds: medicine.switchProductIds
    };

    res.json({
      success: true,
      data: processedMedicine
    });

  } catch (error) {
    console.error('Error fetching medicine details:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/medicine-details/search/suggestions
// @desc    Get search suggestions
// @access  Public
router.get('/search/suggestions', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({
        success: true,
        suggestions: []
      });
    }

    const suggestions = await Medicine.find({
      $or: [
        { productName: { $regex: q, $options: 'i' } },
        { compositionName: { $regex: q, $options: 'i' } },
        { molecules: { $regex: q, $options: 'i' } }
      ],
      isActive: { $ne: false }, // Show if not explicitly false
      isSellable: { $ne: 'N' } // Show if not explicitly 'N'
    })
    .select('productName compositionName molecules brand displayPrice imageUrl')
    .limit(10)
    .lean();

    const processedSuggestions = suggestions.map(medicine => ({
      id: medicine._id,
      name: medicine.productName,
      composition: medicine.compositionName,
      molecules: medicine.molecules,
      brand: medicine.brand,
      price: medicine.displayPrice,
      image: medicine.imageUrl || "https://placehold.co/300x300/FF385C/FFFFFF/png?text=Medicine"
    }));

    res.json({
      success: true,
      suggestions: processedSuggestions
    });

  } catch (error) {
    console.error('Error fetching search suggestions:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/medicine-details/parse-prescription
// @desc    Parse uploaded prescription file (CSV, XLSX, XLS) and match medicines
// @access  Public
router.post('/parse-prescription', upload.single('file'), async (req, res) => {
  try {
    let extractedItems = [];

    if (req.file) {
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      if (firstSheetName && workbook.Sheets[firstSheetName]) {
        const sheet = workbook.Sheets[firstSheetName];
        extractedItems = extractMedicinesFromSheet(sheet);
      }
    } else if (req.body && req.body.items) {
      extractedItems = Array.isArray(req.body.items)
        ? req.body.items
        : JSON.parse(req.body.items);
    }

    if (!extractedItems || extractedItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No medicines could be extracted from the file. Please ensure the file contains medicine names.'
      });
    }

    // Match each extracted medicine against DB
    const results = [];
    for (let index = 0; index < extractedItems.length; index++) {
      const item = extractedItems[index];
      if (!item.name || typeof item.name !== 'string') continue;
      const rawName = item.name.trim();
      const cleanName = rawName.replace(/[^a-zA-Z0-9\s]/g, '').trim();

      // Search DB
      let matchedDoc = await Medicine.findOne({
        productName: { $regex: cleanName, $options: 'i' },
        isActive: { $ne: false },
        isSellable: { $ne: 'N' }
      }).lean();

      if (!matchedDoc) {
        // Try searching by primary word
        const words = cleanName.split(/\s+/).filter(w => w.length >= 3);
        if (words.length > 0) {
          matchedDoc = await Medicine.findOne({
            $or: [
              { productName: { $regex: words[0], $options: 'i' } },
              { compositionName: { $regex: words[0], $options: 'i' } },
              { molecules: { $regex: words[0], $options: 'i' } }
            ],
            isActive: { $ne: false },
            isSellable: { $ne: 'N' }
          }).lean();
        }
      }

      if (matchedDoc) {
        const sellingPrice = matchedDoc.displayPrice;
        const calculatedMrp = sellingPrice * 1.1;
        results.push({
          id: matchedDoc._id.toString(),
          productId: matchedDoc.productId,
          name: matchedDoc.productName,
          originalExtractedName: rawName,
          brand: matchedDoc.brand,
          manufacturer: matchedDoc.manufacturer,
          composition: matchedDoc.compositionName,
          molecules: matchedDoc.molecules,
          image: matchedDoc.imageUrl || "https://placehold.co/300x300/FF385C/FFFFFF/png?text=Medicine",
          price: sellingPrice,
          mrp: calculatedMrp,
          discount: 10,
          quantity: item.quantity || 1,
          dosage: item.dosage || '',
          stock: matchedDoc.stock || 100,
          productForm: matchedDoc.productFormName,
          prescriptionRequired: matchedDoc.isPrescriptionRequired === 'Y',
          matched: true,
          selected: true
        });
      } else {
        const itemPrice = item.price || 99.00;
        results.push({
          id: `prescription-custom-${index}-${Date.now()}`,
          productId: `PR-CUSTOM-${index}`,
          name: rawName,
          originalExtractedName: rawName,
          brand: 'Prescription Medicine',
          manufacturer: 'Verified Pharmacist Item',
          composition: item.dosage ? `Prescribed Dosage: ${item.dosage}` : 'Prescribed Item',
          molecules: 'Prescribed Formula',
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
        });
      }
    }

    return res.json({
      success: true,
      fileName: req.file ? req.file.originalname : 'Prescription File',
      totalExtracted: results.length,
      matchedCount: results.filter(r => r.matched).length,
      medicines: results
    });

  } catch (error) {
    console.error('Error parsing prescription file:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to parse prescription file',
      error: error.message
    });
  }
});

module.exports = router;

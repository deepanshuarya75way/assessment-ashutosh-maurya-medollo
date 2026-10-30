const Order = require('../models/Order');
const User = require('../models/user.model');
const Medicine = require("../models/Medicine");

// Create a new order
const createOrder = async (req, res) => {
  try {
    const {
      items,
      shippingAddress,
      paymentMethod,
      shippingMethod,
      subtotal,
      shippingCost,
      taxAmount,
      totalAmount
    } = req.body;

    // Get user from auth middleware (assuming req.user is set)
    const userId = req.user ? req.user.id : null;

    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Order must contain at least one item' });
    }

    if (!shippingAddress || !paymentMethod || !subtotal || !shippingCost || !taxAmount || !totalAmount) {
      return res.status(400).json({ message: 'Missing required order information' });
    }

    // Before proceed to order fetch all the medicines from current db
    const medicineIds = items.map(i => i.medicine);
    console.log("1", medicineIds);
    const catalogMed = await Medicine.find({_id: {$in: medicineIds}}).lean();
    console.log("cate", catalogMed);
    const catalogMap  = {};
    for(const med of catalogMed){
      catalogMap[String(med._id)] = med;
    }

    const staleSummary = [];
    console.log("items"+items);
    for(const item of items){
      const medId = String(item.medicine);
      const catalog = catalogMap[medId];

      if(!catalog){
        staleSummary.push(`A requested medicine (id: ${medId}) is no longer available.`);
        continue;
      }
      console.log("Cata", catalog);
      if(catalog.isSellable !== 'Y'){
        staleSummary.push(`"${catalog.productName}" is not available for purchase`);
        continue;
      }

      if(typeof catalog.stock === 'number' && catalog.stock < item.quantity){
        staleSummary.push(`"${catalog.productName}" has not sufficient stock (requested : ${item.quantity}, available: ${catalog.stock}).`);
        continue;
      }

      const catalogPrice = catalog.displayPrice;
      const clientPrice = Number(item.price);
      if(Math.abs(clientPrice - catalogPrice) > 0.5){
        staleSummary.push(
          `The price of "${catalog.productName}" has changed ` + 
          `(your cart: Rs.${clientPrice.toFixed(2)}, current: Rs.${catalogPrice.toFixed(2)}).` + 
          `Please review your cart.`
        );
      }
    }

    if(staleSummary.length > 0){
      return res.status(422).json({
        message: ' Some items in your cart are not valid.',
        errorCode: 'STALE_CART',
        details: staleSummary,
      });
    }

    const validatedItems = items.map(item => ({
      medicine: item.medicine,
      quantity: items.quantity,
      price: catalogMap[String(item.medicine)],
      displayPrice,
    }));

    const verifiedSubtotal = validatedItems.reduce(
      (sum, item) => sum + item.price * item.quantity, 0
    );

    const verifiedTotal = verifiedSubtotal + Number(shippingCost) + Number(taxAmount);

    // Create the order
    const order = new Order({
      user: userId,
      items: validatedItems,
      shippingAddress,
      paymentMethod,
      shippingMethod: shippingMethod || 'standard',
      subtotal: verifiedSubtotal,
      shippingCost: Number(shippingCost),
      taxAmount: Number(taxAmount),
      totalAmount: verifiedTotal,
    });

    const savedOrder = await order.save();

    // Populate the order with medicine details
    await savedOrder.populate([
      { path: 'user', select: 'name email phone' },
      { path: 'items.medicine', select: 'productName brand mrp displayPrice imageUrl' }
    ]);

    res.status(201).json({
      message: 'Order created successfully',
      order: savedOrder
    });

  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({
      message: 'Failed to create order',
      error: error.message
    });
  }
};

// Get all orders for a user
const getUserOrders = async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;

    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const orders = await Order.find({ user: userId })
      .populate('user', 'name email phone')
      .populate('items.medicine', 'productName brand mrp displayPrice imageUrl')
      .sort({ createdAt: -1 });

    res.status(200).json(orders);

  } catch (error) {
    console.error('Error fetching user orders:', error);
    res.status(500).json({
      message: 'Failed to fetch orders',
      error: error.message
    });
  }
};

// Get order by ID
const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user ? req.user.id : null;

    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const order = await Order.findOne({ _id: id, user: userId })
      .populate('user', 'name email phone')
      .populate('items.medicine', 'productName brand mrp displayPrice imageUrl');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.status(200).json(order);

  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({
      message: 'Failed to fetch order',
      error: error.message
    });
  }
};

// Update order status (for admin)
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { orderStatus, paymentStatus } = req.body;

    const updateData = {};
    if (orderStatus) updateData.orderStatus = orderStatus;
    if (paymentStatus) updateData.paymentStatus = paymentStatus;

    const order = await Order.findByIdAndUpdate(id, updateData, { new: true })
      .populate('user', 'name email phone')
      .populate('items.medicine', 'productName brand mrp displayPrice imageUrl');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.status(200).json({
      message: 'Order updated successfully',
      order
    });

  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({
      message: 'Failed to update order',
      error: error.message
    });
  }
};

// Get all orders (for admin)
const getAllOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const query = {};
    if (status) {
      query.orderStatus = status;
    }

    const orders = await Order.find(query)
      .populate('user', 'name email phone')
      .populate('items.medicine', 'productName brand mrp displayPrice imageUrl')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Order.countDocuments(query);

    res.status(200).json({
      orders,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });

  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      message: 'Failed to fetch orders',
      error: error.message
    });
  }
};

module.exports = {
  createOrder,
  getUserOrders,
  getOrderById,
  updateOrderStatus,
  getAllOrders
};
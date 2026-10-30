import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CreditCardIcon,
  BuildingLibraryIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import PageTransition from "../components/ui/PageTransition";
import { useCart } from "../context/CartContext";

const CheckoutPage = () => {
  const navigate = useNavigate();
  const { cartItems, cartTotal, clearCart, isLoggedIn } = useCart();
  const [formData, setFormData] = useState({
    // Contact Information
    email: "",
    phone: "",

    // Shipping Information
    fullName: "",
    address: "",
    city: "",
    state: "",
    pincode: "",

    // Payment Information
    cardName: "",
    cardNumber: "",
    expiryDate: "",
    cvv: "",
    saveCard: false,
  });

  const [paymentMethod, setPaymentMethod] = useState("card");
  const [currentStep, setCurrentStep] = useState(1); // 1: Shipping, 2: Payment, 3: Review
  const [isProcessing, setIsProcessing] = useState(false);
  const [errors, setErrors] = useState({});
  const [shippingMethod, setShippingMethod] = useState("standard");
  const [staleCartError, setStaleCartError] = useState(null);

  // Shipping Cost Calculation
  const shippingCost =
    shippingMethod === "standard" ? (cartTotal >= 999 ? 0 : 99) : 199;
  const taxAmount = cartTotal * 0.18;
  const totalAmount = cartTotal + shippingCost + taxAmount;

  // Check if user is logged in, if not redirect to login
  useEffect(() => {
    if (!isLoggedIn) {
      navigate("/login", {
        state: {
          from: "/checkout",
          message: "Please log in to proceed with checkout",
        },
      });
    }
  }, [isLoggedIn, navigate]);

  // Check if cart is empty
  // useEffect(() => {
  //   if (cartItems.length === 0) {
  //     navigate("/products");
  //   }
  // }, [cartItems, navigate]);

  // Handle input changes
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value,
    });

    // Clear error when field is updated
    if (errors[name]) {
      setErrors({
        ...errors,
        [name]: "",
      });
    }
  };

  // Validate form based on current step
  const validateForm = () => {
    const newErrors = {};

    if (currentStep === 1) {
      // Shipping validation
      if (!formData.fullName.trim())
        newErrors.fullName = "Full name is required";
      if (!formData.email.trim()) newErrors.email = "Email is required";
      else if (!/\S+@\S+\.\S+/.test(formData.email))
        newErrors.email = "Email is invalid";
      if (!formData.phone.trim()) newErrors.phone = "Phone number is required";
      else if (!/^\d{10}$/.test(formData.phone.replace(/[^0-9]/g, "")))
        newErrors.phone = "Phone number must be 10 digits";
      if (!formData.address.trim()) newErrors.address = "Address is required";
      if (!formData.city.trim()) newErrors.city = "City is required";
      if (!formData.state.trim()) newErrors.state = "State is required";
      if (!formData.pincode.trim()) newErrors.pincode = "Pincode is required";
      else if (!/^\d{6}$/.test(formData.pincode.replace(/[^0-9]/g, "")))
        newErrors.pincode = "Pincode must be 6 digits";
    }

    if (currentStep === 2 && paymentMethod === "card") {
      // Card payment validation
      if (!formData.cardName.trim())
        newErrors.cardName = "Name on card is required";
      if (!formData.cardNumber.trim())
        newErrors.cardNumber = "Card number is required";
      else if (!/^\d{16}$/.test(formData.cardNumber.replace(/[^0-9]/g, "")))
        newErrors.cardNumber = "Card number must be 16 digits";
      if (!formData.expiryDate.trim())
        newErrors.expiryDate = "Expiry date is required";
      else if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(formData.expiryDate))
        newErrors.expiryDate = "Expiry date format must be MM/YY";
      if (!formData.cvv.trim()) newErrors.cvv = "CVV is required";
      else if (!/^\d{3,4}$/.test(formData.cvv))
        newErrors.cvv = "CVV must be 3 or 4 digits";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle next step
  const handleNextStep = () => {
    if (validateForm()) {
      setCurrentStep(currentStep + 1);
      window.scrollTo(0, 0);
    }
  };

  // Handle back step
  const handlePrevStep = () => {
    setCurrentStep(currentStep - 1);
    window.scrollTo(0, 0);
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (currentStep !== 3) return;
    if (validateForm()) {
      setIsProcessing(true);
      setErrors({});

      try {
        // Get user token
        const token = localStorage.getItem('token');
        if (!token) {
          setErrors({ general: 'Please log in to place an order' });
          setIsProcessing(false);
          return;
        }

        // Prepare order data
        const orderData = {
          items: cartItems.map(item => ({
            medicine: item._id || item.id,
            quantity: item.quantity,
            price: item.discountPrice || item.price || item.displayPrice
          })),
          shippingAddress: {
            fullName: formData.fullName,
            email: formData.email,
            phone: formData.phone,
            address: formData.address,
            city: formData.city,
            state: formData.state,
            pincode: formData.pincode
          },
          paymentMethod: paymentMethod,
          shippingMethod: shippingMethod,
          subtotal: cartTotal,
          shippingCost: shippingCost,
          taxAmount: taxAmount,
          totalAmount: totalAmount
        };

        // Make API call to create order
        const response = await fetch(`${import.meta.env.VITE_REACT_APP_BACKEND_URL}/api/orders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(orderData)
        });

        const data = await response.json();

        if (response.ok) {
          clearCart();
          navigate('/order-success', {
            state: {
              order: data.order,
              orderId: data.order.orderId
            }
          });
        } else if(data.errorCode === 'STALE_CART'){
          setStaleCartError({
            message: data.message,
            details: data.details || [],
          });
          window.scrollTo({top: 0, behavior: 'smooth'});
        } else {
          setErrors({ general: data.message || 'Failed to place order' });
        }
      } catch (error) {
        console.error('Order creation error:', error);
        setErrors({ general: 'Network error. Please try again.' });
      } finally {
        setIsProcessing(false);
      }
    }
  };

  // Determine if next button should be disabled
  const isNextDisabled = () => {
    if (isProcessing) return true;
    return Object.keys(errors).length > 0;
  };

  // Render form based on current step
  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-800">
              Contact Information
            </h3>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    name="email"
                    id="email"
                    value={formData.email}
                    onChange={handleChange}
                    className={`block w-full px-3 py-2 border rounded-md shadow-sm ${
                      errors.email ? "border-red-500" : "border-gray-300"
                    } focus:ring-primary focus:border-primary`}
                  />
                  {errors.email && (
                    <p className="mt-1 text-xs text-red-500">{errors.email}</p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="phone"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    id="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className={`block w-full px-3 py-2 border rounded-md shadow-sm ${
                      errors.phone ? "border-red-500" : "border-gray-300"
                    } focus:ring-primary focus:border-primary`}
                  />
                  {errors.phone && (
                    <p className="mt-1 text-xs text-red-500">{errors.phone}</p>
                  )}
                </div>
              </div>

              <h3 className="text-lg font-semibold text-gray-800 mt-8">
                Shipping Information
              </h3>

              <div>
                <label
                  htmlFor="fullName"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="fullName"
                  id="fullName"
                  value={formData.fullName}
                  onChange={handleChange}
                  className={`block w-full px-3 py-2 border rounded-md shadow-sm ${
                    errors.fullName ? "border-red-500" : "border-gray-300"
                  } focus:ring-primary focus:border-primary`}
                />
                {errors.fullName && (
                  <p className="mt-1 text-xs text-red-500">{errors.fullName}</p>
                )}
              </div>

            <div>
              <label
                htmlFor="address"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Address <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="address"
                id="address"
                value={formData.address}
                onChange={handleChange}
                className={`block w-full px-3 py-2 border rounded-md shadow-sm ${
                  errors.address ? "border-red-500" : "border-gray-300"
                } focus:ring-primary focus:border-primary`}
              />
              {errors.address && (
                <p className="mt-1 text-xs text-red-500">{errors.address}</p>
              )}
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              <div>
                <label
                  htmlFor="city"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  City <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="city"
                  id="city"
                  value={formData.city}
                  onChange={handleChange}
                  className={`block w-full px-3 py-2 border rounded-md shadow-sm ${
                    errors.city ? "border-red-500" : "border-gray-300"
                  } focus:ring-primary focus:border-primary`}
                />
                {errors.city && (
                  <p className="mt-1 text-xs text-red-500">{errors.city}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="state"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  State <span className="text-red-500">*</span>
                </label>
                <select
                  name="state"
                  id="state"
                  value={formData.state}
                  onChange={handleChange}
                  className={`block w-full px-3 py-2 border rounded-md shadow-sm ${
                    errors.state ? "border-red-500" : "border-gray-300"
                  } focus:ring-primary focus:border-primary`}
                >
                  <option value="">Select State</option>
                  <option value="Andhra Pradesh">Andhra Pradesh</option>
                  <option value="Karnataka">Karnataka</option>
                  <option value="Kerala">Kerala</option>
                  <option value="Maharashtra">Maharashtra</option>
                  <option value="Tamil Nadu">Tamil Nadu</option>
                  <option value="Telangana">Telangana</option>
                  {/* Add more states */}
                </select>
                {errors.state && (
                  <p className="mt-1 text-xs text-red-500">{errors.state}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="pincode"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Pincode <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="pincode"
                  id="pincode"
                  value={formData.pincode}
                  onChange={handleChange}
                  className={`block w-full px-3 py-2 border rounded-md shadow-sm ${
                    errors.pincode ? "border-red-500" : "border-gray-300"
                  } focus:ring-primary focus:border-primary`}
                />
                {errors.pincode && (
                  <p className="mt-1 text-xs text-red-500">{errors.pincode}</p>
                )}
              </div>
            </div>

            <h3 className="text-lg font-semibold text-gray-800 mt-8">
              Shipping Method
            </h3>

            <div className="space-y-4">
              <div
                className={`border rounded-md p-4 cursor-pointer ${
                  shippingMethod === "standard"
                    ? "border-primary bg-primary/5"
                    : "border-gray-300"
                }`}
                onClick={() => setShippingMethod("standard")}
              >
                <div className="flex items-center">
                  <input
                    type="radio"
                    name="shippingMethod"
                    id="standard"
                    checked={shippingMethod === "standard"}
                    onChange={() => setShippingMethod("standard")}
                    className="h-4 w-4 text-primary focus:ring-primary border-gray-300"
                  />
                  <div className="ml-3 flex-1">
                    <label
                      htmlFor="standard"
                      className="font-medium text-gray-800 block"
                    >
                      Standard Shipping
                    </label>
                    <p className="text-gray-500 text-sm">
                      Delivery in 3-5 business days
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-medium">
                      {cartTotal >= 499 ? "Free" : "₹99"}
                    </span>
                  </div>
                </div>
              </div>

              <div
                className={`border rounded-md p-4 cursor-pointer ${
                  shippingMethod === "express"
                    ? "border-primary bg-primary/5"
                    : "border-gray-300"
                }`}
                onClick={() => setShippingMethod("express")}
              >
                <div className="flex items-center">
                  <input
                    type="radio"
                    name="shippingMethod"
                    id="express"
                    checked={shippingMethod === "express"}
                    onChange={() => setShippingMethod("express")}
                    className="h-4 w-4 text-primary focus:ring-primary border-gray-300"
                  />
                  <div className="ml-3 flex-1">
                    <label
                      htmlFor="express"
                      className="font-medium text-gray-800 block"
                    >
                      Express Shipping
                    </label>
                    <p className="text-gray-500 text-sm">
                      Delivery in 1-2 business days
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-medium">₹199</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      case 2:
        return (
          <form onSubmit={(e) => e.preventDefault()}>
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-800">
                Payment Method
              </h3>

            <div className="space-y-4">
              <div
                className={`border rounded-md p-4 cursor-pointer ${
                  paymentMethod === "card"
                    ? "border-primary bg-primary/5"
                    : "border-gray-300"
                }`}
                onClick={() => setPaymentMethod("card")}
              >
                <div className="flex items-center">
                  <input
                    type="radio"
                    name="paymentMethod"
                    id="card"
                    checked={paymentMethod === "card"}
                    onChange={() => setPaymentMethod("card")}
                    className="h-4 w-4 text-primary focus:ring-primary border-gray-300"
                  />
                  <label htmlFor="card" className="ml-3 flex items-center">
                    <CreditCardIcon className="h-5 w-5 text-gray-600 mr-2" />
                    <span className="font-medium text-gray-800">
                      Credit/Debit Card
                    </span>
                  </label>
                </div>
              </div>

              <div
                className={`border rounded-md p-4 cursor-pointer ${
                  paymentMethod === "upi"
                    ? "border-primary bg-primary/5"
                    : "border-gray-300"
                }`}
                onClick={() => setPaymentMethod("upi")}
              >
                <div className="flex items-center">
                  <input
                    type="radio"
                    name="paymentMethod"
                    id="upi"
                    checked={paymentMethod === "upi"}
                    onChange={() => setPaymentMethod("upi")}
                    className="h-4 w-4 text-primary focus:ring-primary border-gray-300"
                  />
                  <label htmlFor="upi" className="ml-3 flex items-center">
                    <svg
                      className="h-5 w-5 mr-2"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M6 12.5L10 16.5L18 8.5"
                        stroke="#4F46E5"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span className="font-medium text-gray-800">
                      UPI Payment
                    </span>
                  </label>
                </div>
              </div>

              <div
                className={`border rounded-md p-4 cursor-pointer ${
                  paymentMethod === "netbanking"
                    ? "border-primary bg-primary/5"
                    : "border-gray-300"
                }`}
                onClick={() => setPaymentMethod("netbanking")}
              >
                <div className="flex items-center">
                  <input
                    type="radio"
                    name="paymentMethod"
                    id="netbanking"
                    checked={paymentMethod === "netbanking"}
                    onChange={() => setPaymentMethod("netbanking")}
                    className="h-4 w-4 text-primary focus:ring-primary border-gray-300"
                  />
                  <label
                    htmlFor="netbanking"
                    className="ml-3 flex items-center"
                  >
                    <BuildingLibraryIcon className="h-5 w-5 text-gray-600 mr-2" />
                    <span className="font-medium text-gray-800">
                      Net Banking
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {paymentMethod === "card" && (
              <div className="mt-6 space-y-6 border-t border-gray-200 pt-6">
                <h4 className="text-base font-medium text-gray-800">
                  Card Details
                </h4>

                <div>
                  <label
                    htmlFor="cardName"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Name on Card <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="cardName"
                    id="cardName"
                    value={formData.cardName}
                    onChange={handleChange}
                    className={`block w-full px-3 py-2 border rounded-md shadow-sm ${
                      errors.cardName ? "border-red-500" : "border-gray-300"
                    } focus:ring-primary focus:border-primary`}
                  />
                  {errors.cardName && (
                    <p className="mt-1 text-xs text-red-500">
                      {errors.cardName}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="cardNumber"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Card Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="cardNumber"
                    id="cardNumber"
                    value={formData.cardNumber}
                    onChange={handleChange}
                    placeholder="XXXX XXXX XXXX XXXX"
                    className={`block w-full px-3 py-2 border rounded-md shadow-sm ${
                      errors.cardNumber ? "border-red-500" : "border-gray-300"
                    } focus:ring-primary focus:border-primary`}
                  />
                  {errors.cardNumber && (
                    <p className="mt-1 text-xs text-red-500">
                      {errors.cardNumber}
                    </p>
                  )}
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <label
                      htmlFor="expiryDate"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Expiry Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="expiryDate"
                      id="expiryDate"
                      value={formData.expiryDate}
                      onChange={handleChange}
                      placeholder="MM/YY"
                      className={`block w-full px-3 py-2 border rounded-md shadow-sm ${
                        errors.expiryDate ? "border-red-500" : "border-gray-300"
                      } focus:ring-primary focus:border-primary`}
                    />
                    {errors.expiryDate && (
                      <p className="mt-1 text-xs text-red-500">
                        {errors.expiryDate}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="cvv"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      CVV <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="cvv"
                      id="cvv"
                      value={formData.cvv}
                      onChange={handleChange}
                      maxLength="4"
                      placeholder="XXX"
                      className={`block w-full px-3 py-2 border rounded-md shadow-sm ${
                        errors.cvv ? "border-red-500" : "border-gray-300"
                      } focus:ring-primary focus:border-primary`}
                    />
                    {errors.cvv && (
                      <p className="mt-1 text-xs text-red-500">{errors.cvv}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    name="saveCard"
                    id="saveCard"
                    checked={formData.saveCard}
                    onChange={handleChange}
                    className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                  />
                  <label
                    htmlFor="saveCard"
                    className="ml-2 text-sm text-gray-700"
                  >
                    Save this card for future payments
                  </label>
                </div>
              </div>
            )}

            {paymentMethod === "upi" && (
              <div className="mt-6 space-y-6 border-t border-gray-200 pt-6">
                <h4 className="text-base font-medium text-gray-800">
                  UPI Details
                </h4>

                <div>
                  <label
                    htmlFor="upiId"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    UPI ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="upiId"
                    id="upiId"
                    placeholder="yourname@upi"
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-primary focus:border-primary"
                  />
                </div>

                <div className="flex items-center">
                  <ShieldCheckIcon className="h-5 w-5 text-green-500 mr-2" />
                  <span className="text-sm text-gray-600">
                    Your payment info is secure and encrypted
                  </span>
                </div>
              </div>
            )}

            {paymentMethod === "netbanking" && (
              <div className="mt-6 space-y-6 border-t border-gray-200 pt-6">
                <h4 className="text-base font-medium text-gray-800">
                  Select Bank
                </h4>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {["HDFC Bank", "ICICI Bank", "SBI", "Axis Bank"].map(
                    (bank) => (
                      <div
                        key={bank}
                        className="border rounded-md p-3 text-center cursor-pointer hover:border-primary hover:bg-primary/5"
                      >
                        <div className="text-sm font-medium">{bank}</div>
                      </div>
                    ),
                  )}
                </div>

                <div>
                  <label
                    htmlFor="otherBank"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Other Banks
                  </label>
                  <select
                    name="otherBank"
                    id="otherBank"
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-primary focus:border-primary"
                  >
                    <option value="">Select Bank</option>
                    <option value="kotak">Kotak Mahindra Bank</option>
                    <option value="yesbank">Yes Bank</option>
                    <option value="idfc">IDFC First Bank</option>
                    <option value="federal">Federal Bank</option>
                    {/* Add more banks */}
                  </select>
                </div>
              </div>
            )}
            <div
              className={`border rounded-md p-4 cursor-pointer ${
                paymentMethod === "cod"
                  ? "border-primary bg-primary/5"
                  : "border-gray-300"
              }`}
              onClick={() => setPaymentMethod("cod")}
            >
              <div className="flex items-center">
                <input
                  type="radio"
                  name="paymentMethod"
                  id="cod"
                  checked={paymentMethod === "cod"}
                  onChange={() => setPaymentMethod("cod")}
                  className="h-4 w-4 text-primary focus:ring-primary border-gray-300"
                />
                <label htmlFor="cod" className="ml-3 font-medium text-gray-800">
                  Cash on Delivery
                </label>
              </div>
            </div>

            <div className="mt-6 border-t border-gray-200 pt-6">
              <div className="flex items-center">
                <ShieldCheckIcon className="h-5 w-5 text-green-500 mr-2" />
                <span className="text-sm text-gray-600">
                  All payments are secure and encrypted
                </span>
              </div>
            </div>
          </div>
          </form>
        );

      case 3:
        return (
          <form onSubmit={(e) => e.preventDefault()}>
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-800">
                Review Order
              </h3>

            {/* Order Items */}
            <div className="border rounded-md divide-y divide-gray-200">
              {cartItems.map((item) => (
                <div key={item.id} className="p-4 flex items-center">
                  <div className="w-16 h-16 bg-gray-100 rounded overflow-hidden mr-4">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-200 text-gray-400">
                        No image
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-800">{item.name}</h4>
                    <p className="text-gray-500 text-sm">
                      Quantity: {item.quantity}
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="font-semibold text-gray-800">
                      ₹{(item.discountPrice || item.price) * item.quantity}
                    </div>
                    {item.discountPrice &&
                      item.price !== item.discountPrice && (
                        <div className="text-sm text-gray-500 line-through">
                          ₹{item.price * item.quantity}
                        </div>
                      )}
                  </div>
                </div>
              ))}
            </div>

            {/* Shipping Information */}
            <div className="bg-gray-50 p-4 rounded-md">
              <h4 className="text-base font-medium text-gray-800 mb-3">
                Shipping Information
              </h4>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-600 text-sm">
                    <span className="font-medium">Name:</span>{" "}
                    {formData.fullName}
                  </p>
                  <p className="text-gray-600 text-sm">
                    <span className="font-medium">Email:</span> {formData.email}
                  </p>
                  <p className="text-gray-600 text-sm">
                    <span className="font-medium">Phone:</span> {formData.phone}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600 text-sm">
                    <span className="font-medium">Address:</span>{" "}
                    {formData.address}
                  </p>
                  <p className="text-gray-600 text-sm">
                    <span className="font-medium">City:</span> {formData.city}
                  </p>
                  <p className="text-gray-600 text-sm">
                    <span className="font-medium">State:</span> {formData.state}
                    , {formData.pincode}
                  </p>
                </div>
              </div>
            </div>

            {/* Payment Method */}
            <div className="bg-gray-50 p-4 rounded-md">
              <h4 className="text-base font-medium text-gray-800 mb-3">
                Payment Method
              </h4>
              <p className="text-gray-600 text-sm">
                {paymentMethod === "card" && (
                  <>
                    <span className="font-medium">Card:</span> **** **** ****{" "}
                    {formData.cardNumber.slice(-4)}
                  </>
                )}
                {paymentMethod === "upi" && (
                  <>
                    <span className="font-medium">UPI Payment</span>
                  </>
                )}
                {paymentMethod === "netbanking" && (
                  <>
                    <span className="font-medium">Net Banking</span>
                  </>
                )}
                {paymentMethod === "cod" && (
                  <>
                    <span className="font-medium">Cash on Delivery</span>
                  </>
                )}
              </p>
            </div>

            {/* Billing Summary */}
            <div className="bg-gray-50 p-4 rounded-md">
              <h4 className="text-base font-medium text-gray-800 mb-3">
                Order Summary
              </h4>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    Subtotal ({cartItems.length} items)
                  </span>
                  <span>₹{cartTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    Shipping (
                    {shippingMethod === "standard" ? "Standard" : "Express"})
                  </span>
                  <span>₹{shippingCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Tax (18%)</span>
                  <span>₹{taxAmount.toFixed(2)}</span>
                </div>
              </div>

              <div className="border-t border-gray-200 mt-2 pt-2">
                <div className="flex justify-between font-bold">
                  <span>Total</span>
                  <span>₹{totalAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center bg-green-50 p-4 rounded-md">
              <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
              <p className="text-sm text-green-700">
                By placing this order, you agree to our Terms of Service and
                Privacy Policy.
              </p>
            </div>
          </div>
          </form>
        );

      default:
        return null;
    }
  };

  return (
    <PageTransition variant="fade">
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
          {staleCartError && (
            <motion.div
              id="stale-cart-banner"
              initial = {{opacity: 0, y : -16}}
              animate={{ opacity: 1, y:0}}
              exit={{opacity: 0, y : -16}}
              transition={{ duration: 0.3}}
              className="mb rounded-xl border border-amber-300 bg-amber-50 p-5 shadow-md"
              role="alert"
            >
              <div className="flex items-start gap-3">
                <ExclamationTriangleIcon className = "mt-0.5 h-6 w-6 flex-shrink-0 text-amber-500"/>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-amber-800">
                    Your cart needs a review
                  </h3>
                  <p className="mt-1 text-sm text-amber-700">{staleCartError.message}</p>
                  {staleCartError.details.length > 0 && (
                    <ul className="mt-3 space-y-1 text-sm text-amber-700 list-disc list-inside">
                      {staleCartError.details.map((d, i)=>(
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  )}
                  <button 
                  id="go-to-cart-btn"
                  onClick={()=>navigate('/cart')}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-amber-600 transition-colors"
                  >
                    Go to Cart &amp; Fix Items

                  </button>
                </div>
                <button
                id="dismiss-stale-cart-btn"
                onClick={()=>setStaleCartError(null)}
                className="ml-2 rounded p-1 text-amber-100 hover:bg-a,ber-100 transition-colors"
                aria-label="Dismiss"
                ><XMarkIcon className="h-5 w-5"/></button>
              </div>
            </motion.div>
          )}
            {/* Checkout Steps */}
            <div className="mb-8">
              <div className="flex justify-between items-center">
                {["Shipping", "Payment", "Review"].map((step, index) => (
                  <div key={step} className="flex flex-col items-center flex-1">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium mb-2 ${
                        currentStep > index + 1
                          ? "bg-green-500 text-white"
                          : currentStep === index + 1
                            ? "bg-primary text-white"
                            : "bg-gray-200 text-gray-700"
                      }`}
                    >
                      {currentStep > index + 1 ? (
                        <CheckCircleIcon className="w-5 h-5" />
                      ) : (
                        index + 1
                      )}
                    </div>
                    <div
                      className={`text-sm ${
                        currentStep === index + 1
                          ? "text-primary font-medium"
                          : "text-gray-500"
                      }`}
                    >
                      {step}
                    </div>
                  </div>
                ))}
              </div>

              <div className="relative mt-2">
                <div className="absolute top-0 left-0 w-full h-1 bg-gray-200">
                  <motion.div
                    className="absolute top-0 left-0 h-full bg-primary"
                    initial={{ width: "0%" }}
                    animate={{ width: `${((currentStep - 1) / 2) * 100}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
            </div>

            {/* Checkout Form */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-800">
                  {currentStep === 1 && "Shipping Information"}
                  {currentStep === 2 && "Payment Information"}
                  {currentStep === 3 && "Review Order"}
                </h2>
              </div>

              <div className="p-6">
                {renderStepContent()}

                <div className="mt-8 flex justify-between">
                  {currentStep > 1 && (
                    <button
                      type="button"
                      onClick={handlePrevStep}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                    >
                      Back
                    </button>
                  )}

                  <div className="ml-auto">
                    {currentStep < 3 ? (
                      <button
                        type="button"
                        onClick={handleNextStep}
                        disabled={isNextDisabled()}
                        className={`px-6 py-2 bg-primary text-white rounded-md hover:bg-primary-dark ${
                          isNextDisabled()
                            ? "opacity-50 cursor-not-allowed"
                            : ""
                        }`}
                      >
                        Continue
                      </button>
                    ) : (
                      <button
                        onClick={handleSubmit}
                        disabled={isProcessing}
                        className={`px-6 py-2 bg-primary text-white rounded-md hover:bg-primary-dark flex items-center ${
                          isProcessing ? "opacity-50 cursor-not-allowed" : ""
                        }`}
                      >
                        {isProcessing ? (
                          <>
                            <svg
                              className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              ></circle>
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              ></path>
                            </svg>
                            Processing...
                          </>
                        ) : (
                          "Place Order"
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
};

export default CheckoutPage;

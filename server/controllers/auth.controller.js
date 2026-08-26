

const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const twilio = require('twilio');




// Initialize Twilio client with error handling
let client = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
  console.log("Twilio client initialized successfully");
} else {
  console.error("Twilio credentials not found. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables.");
}

// Helper function to format phone number
const formatPhoneNumber = (phone) => {
  if (!phone) return { formattedPhone: '', phoneWithCountryCode: '' };
  const cleanDigits = phone.replace(/\D/g, '');
  let formattedPhone = cleanDigits;
  let phoneWithCountryCode = `+91${cleanDigits}`;

  if (cleanDigits.length === 12 && cleanDigits.startsWith('91')) {
    formattedPhone = cleanDigits.slice(2);
    phoneWithCountryCode = `+${cleanDigits}`;
  } else if (cleanDigits.length > 10 && !cleanDigits.startsWith('91')) {
    formattedPhone = cleanDigits;
    phoneWithCountryCode = `+${cleanDigits}`;
  }

  return { formattedPhone, phoneWithCountryCode };
};

// Helper function to generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    // Check if user already exists by phone
    const { formattedPhone } = formatPhoneNumber(phone);
    const userExists = await User.findOne({ phone: formattedPhone });
    if (userExists && userExists.name !== 'Temporary User') {
      return res.status(400).json({
        success: false,
        message: 'User with this phone number already exists',
      });
    }

    // Check if email is provided and if user exists with that email
    if (email) {
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: 'User with this email already exists',
        });
      }
    }

    // Generate avatar URL using UI Avatars service
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;

    let user;
    if (userExists && userExists.name === 'Temporary User') {
      // Update existing temporary user
      userExists.name = name;
      userExists.email = email || undefined;
      userExists.password = password;
      userExists.avatarUrl = avatarUrl;
      user = await userExists.save();
    } else {
      // Create new user
      user = await User.create({
        name,
        email: email || undefined,
        password,
        phone: formattedPhone,
        avatarUrl,
        isPhoneVerified: true, // Phone is already verified during OTP process
      });
    }

    // Generate token
    const token = generateToken(user._id);

    // Return user data without password
    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        role: user.role,
        isPhoneVerified: user.isPhoneVerified,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, phone, password } = req.body;

    // Check if credentials are provided
    if ((!email && !phone) || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email/phone and password',
      });
    }

    let user;
    if (phone) {
      // Login with phone number
      const { formattedPhone } = formatPhoneNumber(phone);
      user = await User.findOne({ phone: formattedPhone }).select('+password');
    } else {
      // Login with email
      user = await User.findOne({ email }).select('+password');
    }

    // Check if user exists
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    // Check if password matches
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    // Check if user account is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Your account has been deactivated',
      });
    }

    // Generate token
    const token = generateToken(user._id);

    // Return user data without password
    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        avatarUrl: user.avatarUrl,
        role: user.role,
        isPhoneVerified: user.isPhoneVerified,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        avatarUrl: user.avatarUrl,
        role: user.role,
        isPhoneVerified: user.isPhoneVerified,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Send OTP to phone number
// @route   POST /api/auth/send-otp
// @access  Public
exports.sendOTP = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required',
      });
    }

    const { formattedPhone, phoneWithCountryCode } = formatPhoneNumber(phone);

    // Check if user exists with this phone number
    let user = await User.findOne({ phone: formattedPhone });

    if (!user) {
      // Create a temporary user for OTP verification
      user = new User({
        phone: formattedPhone,
        name: 'Temporary User', // Will be updated during registration
        password: 'temppass', // Will be updated during registration
      });
    }

    // Generate OTP
    console.log("Generating OTP for user:", formattedPhone);
    const otp = user.generatePhoneVerificationOTP();
    console.log("OTP", otp);
    console.log("OTP expires at:", new Date(user.phoneVerificationExpires));
    await user.save();
    console.log("User saved with OTP", otp);

    // Send OTP via Twilio
    if (!client) {
      // Development mode: Log OTP to console
      console.log("=".repeat(50));
      console.log(" DEVELOPMENT MODE - OTP NOT SENT VIA SMS");
      console.log(" Phone Number:", phoneWithCountryCode);
      console.log(" OTP Code:", otp);
      console.log(" Expires at:", new Date(user.phoneVerificationExpires));
      console.log("=".repeat(50));
      
      return res.status(200).json({
        success: true,
        message: 'OTP generated (Development mode - check server console)',
        phone: formattedPhone,
        developmentMode: true,
        otp: otp
      });
    }

    try {
      await client.messages.create({
        body: `Your Medollo verification code is: ${otp}. This code will expire in 30 minutes.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phoneWithCountryCode,
      });

      return res.status(200).json({
        success: true,
        message: 'OTP sent successfully',
        phone: formattedPhone,
      });
    } catch (twilioError) {
      console.error("📩 Twilio Detailed Error:", {
        message: twilioError.message,
        code: twilioError.code,
        moreInfo: twilioError.moreInfo,
        status: twilioError.status,
        stack: twilioError.stack,
      });

      console.log("=".repeat(50));
      console.log(" ⚠️ TWILIO SMS DISPATCH FAILED (Fallback mode activated)");
      console.log(" Reason:", twilioError.message);
      console.log(" Phone Number:", phoneWithCountryCode);
      console.log(" OTP Code:", otp);
      console.log(" Expires at:", new Date(user.phoneVerificationExpires));
      console.log("=".repeat(50));

      return res.status(200).json({
        success: true,
        message: `OTP generated (Twilio SMS failed: ${twilioError.message}. Check console or fallback OTP)`,
        phone: formattedPhone,
        developmentMode: true,
        otp: otp,
        twilioError: twilioError.message
      });
    }
  } catch (error) {
    console.log("error: ", error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// @desc    Verify OTP
// @route   POST /api/auth/verify-otp
// @access  Public
exports.verifyOTP = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and OTP are required',
      });
    }

    const { formattedPhone } = formatPhoneNumber(phone);
    const user = await User.findOne({ phone: formattedPhone });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'User not found',
      });
    }

    if (!user.verifyPhoneOTP(otp)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP',
      });
    }

    // Mark phone as verified and clear OTP fields
    user.isPhoneVerified = true;
    user.phoneVerificationOTP = undefined;
    user.phoneVerificationExpires = undefined;
    await user.save();

    // Issue JWT so the user is logged in after OTP verification
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: 'Phone number verified successfully',
      isVerified: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        avatarUrl: user.avatarUrl,
        role: user.role,
        isPhoneVerified: user.isPhoneVerified,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
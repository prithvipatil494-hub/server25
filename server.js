// Emergency SOS Backend Server with Twilio WhatsApp Integration
// Install dependencies: npm install express cors mongoose dotenv twilio body-parser

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const twilio = require('twilio');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Environment Variables
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://prithvipatil494_db_user:rankalaismybestfriend@cluster0.ozmxva5.mongodb.net/?appName=Cluster0";
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM; // Format: whatsapp:+14155238886

// Initialize Twilio client
let twilioClient = null;
let isTwilioConfigured = false;

if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_FROM) {
  try {
    twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    isTwilioConfigured = true;
    console.log('✅ Twilio WhatsApp configured successfully');
  } catch (error) {
    console.error('❌ Twilio configuration error:', error.message);
  }
} else {
  console.warn('⚠️  Twilio credentials not configured. WhatsApp messages will be simulated.');
}

// MongoDB Connection
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB connected'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// ============================================
// SCHEMAS
// ============================================

// Emergency Contact Schema
const emergencyContactSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  contacts: [{
    name: { type: String, required: true },
    phone: { type: String, required: true },
    relationship: String,
    isPrimary: { type: Boolean, default: false }
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Emergency Alert Schema
const emergencyAlertSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  trackId: { type: String, required: true, unique: true, index: true },
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  message: { type: String, required: true },
  alertType: { 
    type: String, 
    enum: ['sos', 'accident', 'medical', 'threat', 'other'],
    default: 'sos'
  },
  status: {
    type: String,
    enum: ['active', 'resolved'],
    default: 'active'
  },
  contactsNotified: [{
    name: String,
    phone: String,
    deliveryStatus: String,
    messageSid: String,
    sentAt: Date,
    error: String
  }],
  userName: String,
  resolvedAt: Date,
  createdAt: { type: Date, default: Date.now }
});

const EmergencyContact = mongoose.model('EmergencyContact', emergencyContactSchema);
const EmergencyAlert = mongoose.model('EmergencyAlert', emergencyAlertSchema);

// ============================================
// HELPER FUNCTIONS
// ============================================

// Generate unique tracking ID
function generateTrackId() {
  const prefix = 'EMERGENCY';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

// Format phone number for WhatsApp
function formatWhatsAppNumber(phone) {
  // Remove all non-numeric characters
  let cleaned = phone.replace(/\D/g, '');
  
  // If it doesn't start with country code, assume India (+91)
  if (!cleaned.startsWith('91') && cleaned.length === 10) {
    cleaned = '91' + cleaned;
  }
  
  return `whatsapp:+${cleaned}`;
}

// Send WhatsApp message via Twilio
async function sendWhatsAppMessage(to, message, mediaUrl = null) {
  if (!isTwilioConfigured) {
    console.log('📱 Simulated WhatsApp to:', to);
    console.log('💬 Message:', message);
    return {
      status: 'simulated',
      sid: `SIM${Date.now()}`,
      error: null
    };
  }

  try {
    const messageOptions = {
      from: TWILIO_WHATSAPP_FROM,
      to: formatWhatsAppNumber(to),
      body: message
    };

    if (mediaUrl) {
      messageOptions.mediaUrl = [mediaUrl];
    }

    const sentMessage = await twilioClient.messages.create(messageOptions);
    
    console.log('✅ WhatsApp sent:', sentMessage.sid);
    return {
      status: 'sent',
      sid: sentMessage.sid,
      error: null
    };
  } catch (error) {
    console.error('❌ WhatsApp error:', error.message);
    return {
      status: 'failed',
      sid: null,
      error: error.message
    };
  }
}

// ============================================
// API ROUTES
// ============================================

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK',
    twilioConfigured: isTwilioConfigured,
    timestamp: new Date().toISOString()
  });
});

// Save Emergency Contacts
app.post('/api/emergency/contacts', async (req, res) => {
  try {
    const { userId, contacts } = req.body;

    if (!userId || !contacts || !Array.isArray(contacts)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid request. userId and contacts array required.' 
      });
    }

    // Validate contacts
    for (const contact of contacts) {
      if (!contact.name || !contact.phone) {
        return res.status(400).json({ 
          success: false, 
          error: 'Each contact must have a name and phone number.' 
        });
      }
    }

    // Update or create emergency contacts
    const result = await EmergencyContact.findOneAndUpdate(
      { userId },
      { 
        userId, 
        contacts,
        updatedAt: new Date()
      },
      { 
        upsert: true, 
        new: true 
      }
    );

    res.json({ 
      success: true, 
      message: 'Emergency contacts saved successfully',
      contactCount: contacts.length
    });
  } catch (error) {
    console.error('Error saving contacts:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to save emergency contacts' 
    });
  }
});

// Get Emergency Contacts
app.get('/api/emergency/contacts/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const contactDoc = await EmergencyContact.findOne({ userId });
    
    res.json({ 
      success: true, 
      contacts: contactDoc ? contactDoc.contacts : [] 
    });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch contacts' 
    });
  }
});

// Trigger Emergency SOS
app.post('/api/emergency/sos', async (req, res) => {
  try {
    const { userId, location, message, alertType, userName } = req.body;

    if (!userId || !location || !location.lat || !location.lng) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid request. userId and location required.' 
      });
    }

    // Get emergency contacts
    const contactDoc = await EmergencyContact.findOne({ userId });
    
    if (!contactDoc || contactDoc.contacts.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No emergency contacts found. Please add contacts first.' 
      });
    }

    // Generate tracking ID
    const trackId = generateTrackId();

    // Google Maps link
    const mapsLink = `https://www.google.com/maps?q=${location.lat},${location.lng}`;

    // Compose WhatsApp message
    const alertMessage = `
🚨 *EMERGENCY ALERT* 🚨

${userName || 'Someone'} has triggered an emergency SOS!

📍 *Location:* 
${mapsLink}

📋 *Alert Type:* ${alertType.toUpperCase()}

💬 *Message:* ${message || 'Emergency assistance needed!'}

🆔 *Tracking ID:* ${trackId}

⏰ *Time:* ${new Date().toLocaleString()}

Please check on them immediately or contact emergency services if needed.

This is an automated emergency alert.
`.trim();

    // Send WhatsApp to all contacts
    const notificationResults = [];
    let sentCount = 0;
    let failedCount = 0;

    for (const contact of contactDoc.contacts) {
      const result = await sendWhatsAppMessage(contact.phone, alertMessage);
      
      notificationResults.push({
        name: contact.name,
        phone: contact.phone,
        deliveryStatus: result.status,
        messageSid: result.sid,
        sentAt: new Date(),
        error: result.error
      });

      if (result.status === 'sent' || result.status === 'simulated') {
        sentCount++;
      } else {
        failedCount++;
      }

      // Small delay between messages to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Save alert to database
    const alert = new EmergencyAlert({
      userId,
      trackId,
      location,
      message: message || 'Emergency SOS Alert',
      alertType: alertType || 'sos',
      status: 'active',
      contactsNotified: notificationResults,
      userName: userName || 'User'
    });

    await alert.save();

    res.json({ 
      success: true, 
      message: 'Emergency alert sent successfully',
      trackId,
      twilioConfigured: isTwilioConfigured,
      stats: {
        sent: sentCount,
        failed: failedCount,
        total: contactDoc.contacts.length
      },
      mapsLink
    });
  } catch (error) {
    console.error('Error triggering SOS:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send emergency alert' 
    });
  }
});

// Get User Alerts
app.get('/api/emergency/alerts/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    
    const alerts = await EmergencyAlert.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit);
    
    res.json({ 
      success: true, 
      alerts 
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch alerts' 
    });
  }
});

// Get Alert by Tracking ID
app.get('/api/emergency/track/:trackId', async (req, res) => {
  try {
    const { trackId } = req.params;
    
    const alert = await EmergencyAlert.findOne({ trackId });
    
    if (!alert) {
      return res.status(404).json({ 
        success: false, 
        error: 'Alert not found' 
      });
    }
    
    res.json({ 
      success: true, 
      alert 
    });
  } catch (error) {
    console.error('Error fetching alert:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch alert' 
    });
  }
});

// Resolve Alert
app.post('/api/emergency/resolve/:alertId', async (req, res) => {
  try {
    const { alertId } = req.params;
    
    const alert = await EmergencyAlert.findByIdAndUpdate(
      alertId,
      { 
        status: 'resolved',
        resolvedAt: new Date()
      },
      { new: true }
    );
    
    if (!alert) {
      return res.status(404).json({ 
        success: false, 
        error: 'Alert not found' 
      });
    }

    // Optionally send resolution notification
    if (isTwilioConfigured) {
      const contactDoc = await EmergencyContact.findOne({ userId: alert.userId });
      
      if (contactDoc && contactDoc.contacts.length > 0) {
        const resolutionMessage = `
✅ *EMERGENCY RESOLVED*

The emergency alert (ID: ${alert.trackId}) has been marked as resolved.

⏰ *Resolved at:* ${new Date().toLocaleString()}

Thank you for your quick response!
`.trim();

        // Send to primary contacts only
        for (const contact of contactDoc.contacts.filter(c => c.isPrimary)) {
          await sendWhatsAppMessage(contact.phone, resolutionMessage);
        }
      }
    }
    
    res.json({ 
      success: true, 
      message: 'Alert resolved successfully',
      alert
    });
  } catch (error) {
    console.error('Error resolving alert:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to resolve alert' 
    });
  }
});

// Get User Stats
app.get('/api/emergency/stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const totalAlerts = await EmergencyAlert.countDocuments({ userId });
    const activeAlerts = await EmergencyAlert.countDocuments({ userId, status: 'active' });
    const resolvedAlerts = await EmergencyAlert.countDocuments({ userId, status: 'resolved' });
    
    const contactDoc = await EmergencyContact.findOne({ userId });
    const emergencyContacts = contactDoc ? contactDoc.contacts.length : 0;
    
    res.json({ 
      success: true, 
      stats: {
        totalAlerts,
        activeAlerts,
        resolvedAlerts,
        emergencyContacts
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch stats' 
    });
  }
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║   🚨 Emergency SOS Server Running 🚨          ║
╠════════════════════════════════════════════════╣
║  Port: ${PORT}                                    ║
║  MongoDB: ${mongoose.connection.readyState === 1 ? '✅ Connected' : '❌ Disconnected'}                     ║
║  Twilio WhatsApp: ${isTwilioConfigured ? '✅ Configured' : '⚠️  Not Configured'}       ║
╚════════════════════════════════════════════════╝
  `);
});
const express = require('express');
const Joi = require('joi');
const User = require('../models/User');
const Webinar = require('../models/Webinar');
const logger = require('../utils/logger');

const router = express.Router();

// Validation schema for profile updates
const updateProfileSchema = Joi.object({
  firstName: Joi.string().max(50),
  lastName: Joi.string().max(50),
  preferences: Joi.object({
    notifications: Joi.object({
      email: Joi.boolean(),
      browser: Joi.boolean()
    }),
    timezone: Joi.string()
  })
});

// Get current user profile
router.get('/profile', async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });

  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Update user profile
router.put('/profile', async (req, res) => {
  try {
    const { error, value } = updateProfileSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        details: error.details[0].message
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: value },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    logger.info(`Profile updated for user: ${user.email}`);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: user
    });

  } catch (error) {
    logger.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get user dashboard data
router.get('/dashboard', async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let dashboardData = {
      user: {
        id: userId,
        username: req.user.username,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        role: userRole
      }
    };

    if (userRole === 'admin') {
      // Admin dashboard data
      const totalWebinars = await Webinar.countDocuments({ host: userId });
      const liveWebinars = await Webinar.countDocuments({ 
        host: userId, 
        status: 'live' 
      });
      const upcomingWebinars = await Webinar.countDocuments({
        host: userId,
        status: 'scheduled',
        scheduledDate: { $gte: new Date() }
      });

      // Recent webinars
      const recentWebinars = await Webinar.find({ host: userId })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('title status scheduledDate participants');

      // Calculate total participants across all webinars
      const webinarsWithParticipants = await Webinar.find({ host: userId })
        .select('participants');
      
      const totalParticipants = webinarsWithParticipants.reduce((total, webinar) => {
        return total + webinar.participants.length;
      }, 0);

      dashboardData.stats = {
        totalWebinars,
        liveWebinars,
        upcomingWebinars,
        totalParticipants
      };

      dashboardData.recentWebinars = recentWebinars;

    } else {
      // Student dashboard data
      const joinedWebinars = await Webinar.find({
        'participants.user': userId
      })
      .populate('host', 'firstName lastName username')
      .sort({ scheduledDate: -1 })
      .limit(10)
      .select('title status scheduledDate host participants');

      // Available live webinars
      const liveWebinars = await Webinar.find({
        status: 'live',
        isPublic: true
      })
      .populate('host', 'firstName lastName username')
      .select('title description host participants maxParticipants');

      // Upcoming webinars
      const upcomingWebinars = await Webinar.find({
        status: 'scheduled',
        isPublic: true,
        scheduledDate: { $gte: new Date() }
      })
      .populate('host', 'firstName lastName username')
      .sort({ scheduledDate: 1 })
      .limit(5)
      .select('title description scheduledDate host');

      dashboardData.joinedWebinars = joinedWebinars;
      dashboardData.liveWebinars = liveWebinars;
      dashboardData.upcomingWebinars = upcomingWebinars;

      dashboardData.stats = {
        joinedWebinars: joinedWebinars.length,
        liveWebinars: liveWebinars.length,
        upcomingWebinars: upcomingWebinars.length
      };
    }

    res.json({
      success: true,
      data: dashboardData
    });

  } catch (error) {
    logger.error('Get dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get user's webinar history
router.get('/webinars/history', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = {};
    
    if (req.user.role === 'admin') {
      // Admins see webinars they hosted
      query.host = req.user.id;
    } else {
      // Students see webinars they participated in
      query['participants.user'] = req.user.id;
    }

    // Filter by status
    if (req.query.status) {
      query.status = req.query.status;
    }

    const webinars = await Webinar.find(query)
      .populate('host', 'username firstName lastName')
      .sort({ scheduledDate: -1 })
      .skip(skip)
      .limit(limit)
      .select('title status scheduledDate actualStartTime actualEndTime participants recording');

    const total = await Webinar.countDocuments(query);

    // For student, add their participation details
    if (req.user.role === 'student') {
      webinars.forEach(webinar => {
        const participation = webinar.participants.find(p => 
          p.user.toString() === req.user.id
        );
        webinar.myParticipation = participation;
      });
    }

    res.json({
      success: true,
      data: {
        webinars,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total,
          limit
        }
      }
    });

  } catch (error) {
    logger.error('Get webinar history error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get all users (admin only)
router.get('/', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = {};

    // Filter by role
    if (req.query.role && ['admin', 'student'].includes(req.query.role)) {
      query.role = req.query.role;
    }

    // Filter by active status
    if (req.query.isActive !== undefined) {
      query.isActive = req.query.isActive === 'true';
    }

    // Search by name or email
    if (req.query.search) {
      query.$or = [
        { firstName: { $regex: req.query.search, $options: 'i' } },
        { lastName: { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } },
        { username: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total,
          limit
        }
      }
    });

  } catch (error) {
    logger.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Toggle user active status (admin only)
router.patch('/:id/toggle-status', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Can't deactivate yourself
    if (req.params.id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate your own account'
      });
    }

    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.isActive = !user.isActive;
    await user.save();

    logger.info(`User ${user.email} ${user.isActive ? 'activated' : 'deactivated'} by ${req.user.username}`);

    res.json({
      success: true,
      message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
      data: user
    });

  } catch (error) {
    logger.error('Toggle user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
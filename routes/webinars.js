const express = require('express');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const Webinar = require('../models/Webinar');
const logger = require('../utils/logger');

const router = express.Router();

// Validation schemas
const createWebinarSchema = Joi.object({
  title: Joi.string().max(200).required(),
  description: Joi.string().max(2000).required(),
  scheduledDate: Joi.date().min('now').required(),
  duration: Joi.number().min(15).max(480).required(),
  maxParticipants: Joi.number().min(2).max(1000).default(100),
  settings: Joi.object({
    allowChat: Joi.boolean().default(true),
    allowReactions: Joi.boolean().default(true),
    allowScreenShare: Joi.boolean().default(false),
    allowRecording: Joi.boolean().default(true),
    waitingRoom: Joi.boolean().default(false),
    requireApproval: Joi.boolean().default(false)
  }).default({}),
  tags: Joi.array().items(Joi.string()).default([]),
  isPublic: Joi.boolean().default(true)
});

const updateWebinarSchema = Joi.object({
  title: Joi.string().max(200),
  description: Joi.string().max(2000),
  scheduledDate: Joi.date().min('now'),
  duration: Joi.number().min(15).max(480),
  maxParticipants: Joi.number().min(2).max(1000),
  settings: Joi.object({
    allowChat: Joi.boolean(),
    allowReactions: Joi.boolean(),
    allowScreenShare: Joi.boolean(),
    allowRecording: Joi.boolean(),
    waitingRoom: Joi.boolean(),
    requireApproval: Joi.boolean()
  }),
  tags: Joi.array().items(Joi.string()),
  isPublic: Joi.boolean()
});

// Create webinar (admin only)
router.post('/', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can create webinars'
      });
    }

    // Validate input
    const { error, value } = createWebinarSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        details: error.details[0].message
      });
    }

    // Generate unique room ID
    const roomId = uuidv4();

    // Create webinar
    const webinar = new Webinar({
      ...value,
      host: req.user.id,
      roomId
    });

    await webinar.save();
    await webinar.populate('host', 'username firstName lastName');

    logger.info(`Webinar created: ${webinar.title} by ${req.user.username}`);

    res.status(201).json({
      success: true,
      message: 'Webinar created successfully',
      data: webinar
    });

  } catch (error) {
    logger.error('Create webinar error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get all webinars (with filtering)
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = {};
    
    // Filter by status
    if (req.query.status) {
      query.status = req.query.status;
    }

    // Filter by date range
    if (req.query.from || req.query.to) {
      query.scheduledDate = {};
      if (req.query.from) {
        query.scheduledDate.$gte = new Date(req.query.from);
      }
      if (req.query.to) {
        query.scheduledDate.$lte = new Date(req.query.to);
      }
    }

    // Filter by host (for admin users)
    if (req.user.role === 'admin' && req.query.host) {
      query.host = req.query.host;
    } else if (req.user.role === 'admin' && req.query.myWebinars === 'true') {
      query.host = req.user.id;
    }

    // For students, only show public webinars
    if (req.user.role === 'student') {
      query.isPublic = true;
    }

    // Search by title or description
    if (req.query.search) {
      query.$or = [
        { title: { $regex: req.query.search, $options: 'i' } },
        { description: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    const webinars = await Webinar.find(query)
      .populate('host', 'username firstName lastName')
      .sort({ scheduledDate: req.query.sort === 'asc' ? 1 : -1 })
      .skip(skip)
      .limit(limit);

    const total = await Webinar.countDocuments(query);

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
    logger.error('Get webinars error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get single webinar
router.get('/:id', async (req, res) => {
  try {
    const webinar = await Webinar.findById(req.params.id)
      .populate('host', 'username firstName lastName')
      .populate('participants.user', 'username firstName lastName');

    if (!webinar) {
      return res.status(404).json({
        success: false,
        message: 'Webinar not found'
      });
    }

    // Students can only view public webinars
    if (req.user.role === 'student' && !webinar.isPublic) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: webinar
    });

  } catch (error) {
    logger.error('Get webinar error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Update webinar (admin and host only)
router.put('/:id', async (req, res) => {
  try {
    const webinar = await Webinar.findById(req.params.id);

    if (!webinar) {
      return res.status(404).json({
        success: false,
        message: 'Webinar not found'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && webinar.host.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this webinar'
      });
    }

    // Can't update live or ended webinars
    if (webinar.status === 'live' || webinar.status === 'ended') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update live or ended webinars'
      });
    }

    // Validate input
    const { error, value } = updateWebinarSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        details: error.details[0].message
      });
    }

    // Update webinar
    Object.assign(webinar, value);
    await webinar.save();
    await webinar.populate('host', 'username firstName lastName');

    logger.info(`Webinar updated: ${webinar.title} by ${req.user.username}`);

    res.json({
      success: true,
      message: 'Webinar updated successfully',
      data: webinar
    });

  } catch (error) {
    logger.error('Update webinar error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Delete webinar (admin and host only)
router.delete('/:id', async (req, res) => {
  try {
    const webinar = await Webinar.findById(req.params.id);

    if (!webinar) {
      return res.status(404).json({
        success: false,
        message: 'Webinar not found'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && webinar.host.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this webinar'
      });
    }

    // Can't delete live webinars
    if (webinar.status === 'live') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete live webinars'
      });
    }

    await Webinar.findByIdAndDelete(req.params.id);

    logger.info(`Webinar deleted: ${webinar.title} by ${req.user.username}`);

    res.json({
      success: true,
      message: 'Webinar deleted successfully'
    });

  } catch (error) {
    logger.error('Delete webinar error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Start webinar (host only)
router.post('/:id/start', async (req, res) => {
  try {
    const webinar = await Webinar.findById(req.params.id);

    if (!webinar) {
      return res.status(404).json({
        success: false,
        message: 'Webinar not found'
      });
    }

    // Check if user is the host
    if (webinar.host.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Only the host can start the webinar'
      });
    }

    // Check if webinar is scheduled
    if (webinar.status !== 'scheduled') {
      return res.status(400).json({
        success: false,
        message: 'Webinar cannot be started'
      });
    }

    // Start webinar
    await webinar.startWebinar();
    await webinar.populate('host', 'username firstName lastName');

    logger.info(`Webinar started: ${webinar.title} by ${req.user.username}`);

    res.json({
      success: true,
      message: 'Webinar started successfully',
      data: webinar
    });

  } catch (error) {
    logger.error('Start webinar error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// End webinar (host only)
router.post('/:id/end', async (req, res) => {
  try {
    const webinar = await Webinar.findById(req.params.id);

    if (!webinar) {
      return res.status(404).json({
        success: false,
        message: 'Webinar not found'
      });
    }

    // Check if user is the host
    if (webinar.host.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Only the host can end the webinar'
      });
    }

    // Check if webinar is live
    if (webinar.status !== 'live') {
      return res.status(400).json({
        success: false,
        message: 'Webinar is not live'
      });
    }

    // End webinar
    await webinar.endWebinar();
    await webinar.populate('host', 'username firstName lastName');

    logger.info(`Webinar ended: ${webinar.title} by ${req.user.username}`);

    res.json({
      success: true,
      message: 'Webinar ended successfully',
      data: webinar
    });

  } catch (error) {
    logger.error('End webinar error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get live webinars
router.get('/status/live', async (req, res) => {
  try {
    const webinars = await Webinar.findLiveWebinars();

    res.json({
      success: true,
      data: webinars
    });

  } catch (error) {
    logger.error('Get live webinars error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get upcoming webinars
router.get('/status/upcoming', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const webinars = await Webinar.findUpcomingWebinars(limit);

    res.json({
      success: true,
      data: webinars
    });

  } catch (error) {
    logger.error('Get upcoming webinars error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Join webinar room (get room details)
router.post('/:id/join', async (req, res) => {
  try {
    const webinar = await Webinar.findById(req.params.id)
      .populate('host', 'username firstName lastName');

    if (!webinar) {
      return res.status(404).json({
        success: false,
        message: 'Webinar not found'
      });
    }

    // Students can only join public webinars
    if (req.user.role === 'student' && !webinar.isPublic) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Check if webinar is live (students can only join live webinars)
    if (req.user.role === 'student' && webinar.status !== 'live') {
      return res.status(400).json({
        success: false,
        message: 'Webinar is not live'
      });
    }

    // Check participant limit
    const activeParticipants = webinar.participants.filter(p => !p.leftAt).length;
    if (activeParticipants >= webinar.maxParticipants) {
      return res.status(400).json({
        success: false,
        message: 'Webinar is full'
      });
    }

    // Determine user role in webinar
    let participantRole = 'attendee';
    if (webinar.host._id.toString() === req.user.id) {
      participantRole = 'host';
    }

    res.json({
      success: true,
      message: 'Ready to join webinar',
      data: {
        webinar: {
          id: webinar._id,
          title: webinar.title,
          description: webinar.description,
          roomId: webinar.roomId,
          status: webinar.status,
          settings: webinar.settings,
          host: webinar.host,
          participantCount: activeParticipants
        },
        participant: {
          role: participantRole,
          permissions: {
            canPresent: participantRole === 'host',
            canShareScreen: participantRole === 'host' || webinar.settings.allowScreenShare,
            canChat: webinar.settings.allowChat,
            canReact: webinar.settings.allowReactions
          }
        }
      }
    });

  } catch (error) {
    logger.error('Join webinar error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
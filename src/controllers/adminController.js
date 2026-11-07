const adminAuthController = require("./adminAuthController");
const adminApplicationsController = require("./adminApplicationsController");
const adminPostsController = require("./adminPostsController");
const adminEventsController = require("./adminEventsController");
const adminVolunteersController = require("./adminVolunteersController");
const adminDirectoryController = require("./adminDirectoryController");

module.exports = {
  // Admin Authentication & Account Settings
  ...adminAuthController,
  // Applications Management
  ...adminApplicationsController,
  // Posts Management & Media Streaming
  ...adminPostsController,
  // Events Management & Responses
  ...adminEventsController,
  // Volunteers Registration & List
  ...adminVolunteersController,
  // Students & Alumni Directory
  ...adminDirectoryController,
};

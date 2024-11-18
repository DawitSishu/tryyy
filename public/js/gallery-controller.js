"use strict";

var FileContainer = require("../../app/models/fileContainer.js");
var User = require("../../app/models/user.js").User;
var fs = require("fs");
var csv = require("csv-parser");

module.exports = {
  getUserFiles: function (userId, callback) {
    console.log("Fetching files for user ID:", userId);

    User.findById(userId).exec(function (err, user) {
      if (err) {
        console.error("Error finding user:", err.message);
        return callback(err);
      }

      if (!user) {
        console.log("User not found for ID:", userId);
        return callback(new Error("User not found"));
      }

      console.log("User found:", user.name.first, user.name.last);

      FileContainer.find({ "parent.id": user._id })
        .limit(10)
        .exec(function (err, files) {
          if (err) {
            console.error("Error fetching files for user:", err.message);
            return callback(err);
          }

          console.log(
            "Files retrieved:",
            files.length > 0 ? files.length + " files" : "No files found"
          );
          callback(null, files);
        });
    });
  },

  parseCsvFile: function (filePath, callback) {
    console.log("Reading CSV file from path:", filePath);

    fs.access(filePath, fs.constants.F_OK, function (err) {
      if (err) {
        console.error("File does not exist or is not accessible:", filePath);
        return callback(null, []); // Return empty data
      }

      var csvData = [];
      fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", function (row) {
          var rowArray = Object.values(row);
          csvData.push(rowArray);
        })
        .on("end", function () {
          if (csvData.length === 0) {
            console.warn("CSV data parsing resulted in empty data:", filePath);
            return callback(null, []); // Return empty data
          }
          console.log(
            "CSV data parsing complete. Total rows parsed: haaaaaaaaaaa",
            csvData.length
          );
          callback(null, csvData);
        })
        .on("error", function (err) {
          console.error("Error reading CSV file:", err.message);
          callback(null, []); // Return empty data on error
        });
    });
  },

  initGallery: function (req, res) {
    if (!req.user || !req.user._id) {
      console.error("No user is authenticated.");
      return res.status(401).send("Unauthorized");
    }

    var userId = req.user._id;
    var self = this;

    self.getUserFiles(userId, function (err, files) {
      if (err) {
        console.error("Error retrieving user files:", err.message);
        return res.status(500).send("Internal server error");
      }

      var processedFiles = [];
      var processedCount = 0;

      if (files.length === 0) {
        console.log("No files to process.");
        return res.render("gallery", {
          user: req.user,
          files: processedFiles, // Empty array if no files
        });
      }

      files.forEach(function (file) {
        var filePath = file.file.path;

        self.parseCsvFile(filePath, function (err, csvData) {
          processedCount++;
          if (csvData.length > 0) {
            file.csvData = csvData.slice(0, 10); // Limit to 10 row
            processedFiles.push(file);
          } else {
            console.warn("Error or no data for file:", file.file.name);
          }

          if (processedCount === files.length) {
            // let finalData = []
            for (let i = 0; i < processedFiles.length; i++) {
                let x ={...processedFiles[i]}
                x["_doc"].csvData = x.csvData
            }
            // console.log(
            //   "Processed files sent to the frontend:",
            //   processedFiles[0].csvData 
            // );
            res.render("gallery", {
              user: req.user,
              files: processedFiles,
            });
          }
        });
      });
    });
  },
};

module.exports.initGallery = module.exports.initGallery;
module.exports.getUserFiles = module.exports.getUserFiles;
module.exports.parseCsvFile = module.exports.parseCsvFile;

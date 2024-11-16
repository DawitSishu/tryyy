var formidable           = require('formidable');
var mongoose             = require('mongoose');
var grid                 = require('gridfs-stream');
var fs                   = require('fs');
var util                 = require('util');
var multipart            = require('multipart');
var Promise              = require('bluebird');
var config               = require('../../config/config');
var mailer               = require('../../config/mailer');
const path = require('path');

// Load other models
var Users          = mongoose.model('User');
var FileContainers = mongoose.model('FileContainer');

exports.displayGallery = function(req, res){
}

// GET
exports.download = function(req, res){   
    FileContainers.findOne({_id: req.params.fileId}, function( err, doc ){
        if( err ) {
	    res.status(500).send({err: "Server error"});
	    throw new Error( err );
	}
	if( !doc ) {
	    res.status(404).send({ err: "File not found"});
	} else if( doc.viewableTo( req.user ) ){
            loadFile( doc.getFile( res ) );
        } else {
            res.status(404).send({ err: "File not found"});
        }
    });
}

// DELETE
exports.deleteFile = function(req, res){
    // need owner id 
    // need container id
    // proven to be authenticated user 
    
    res.send(200);
}

exports.requestAccess = function(req, res){

    var user           = null;
    var fileContainer  = null;
    var fcQuery        = null;
    
    // Only authenticated users can request access
    if( !req.isAuthenticated() ) 
	return res.redirect('/404');
    
    var query = req.params.bullet ? {
	'links.bullet': req.params.bullet
    } : {
	'parent.id': req.params.userID,
	'links.bullet': req.params.datascape 
    };

    FileContainers.findOne( fcQuery, function(fcErr, fc){
	if( fcErr ){
	    res.render('500.ejs', {user: req.user});
	    throw new Error( fcErr );
	}
	if( !fc ) return res.render('404.ejs', {user: req.user});
	
	Users.findOne( { _id: fc.parent.id }, function(userErr, user){
	    if( userErr ){
		res.render('500.ejs', {user: req.user});
		throw new Error( userErr );
	    }
	    
	    // This should not hapen
	    if( !fc ) return res.render('404.ejs', {user: req.user});
	    
	    // User here is the person requesting the datascape
	    var mailObject = { datascape: fc, user: req.user};
	    
	    mailer.useTemplate( 'share-request-private', user, mailObject, function(mailError){
		if( mailError ){ 
		    res.render('500.ejs', {user: req.user});
		    throw new Error( mailError );
		}
		
		res.render('request-access-message-receipt.ejs', {user: req.user, datascape: fc});
	    });
	});
    });
};

// In controllers/fileContainers.js
exports.displayDatascape = function(req, res) {
    var query = req.params.datascape
        ? { 'parent.id': req.params.userID, 'links.bullet': req.params.datascape }
        : { 'links.bullet': req.params.bullet };

    FileContainers.findOne(query, function(err, doc) {
        if (err) {
            console.error("Error retrieving datascape:", err);
            return res.render('500.ejs', { user: req.user });
        }

        if (!doc) {
            console.warn("Datascape not found with query:", query);
            return res.render('404.ejs', { user: req.user });
        }

        // Ensure parent and name properties exist to avoid undefined errors in the view
        doc.parent = doc.parent || {};  // Ensure parent is defined
        doc.parent.name = doc.parent.name || { first: 'Unknown', last: 'User' };  // Default values if name is missing

        var isOwner = req.isAuthenticated() && req.user && req.user._id.toString() === doc.parent.id;

        if (doc.viewableTo(req.user)) {
            res.render('datascape.ejs', { user: req.user, datascape: doc, isOwner: isOwner });
        } else {
            res.render('request-access.ejs', { user: req.user, datascape: doc });
        }
    });
};

//http://10.1.0.117:3000/u/USER-ID/datascapes/6qh4c0418aor
exports.datascapeGetCSV = function(req, res) {
    const query = req.params.bullet
        ? { 'links.bullet': req.params.bullet }
        : { 'parent.id': req.params.userID, 'links.bullet': req.params.datascape };
		var filePath = ""
		var name =""

    FileContainers.findOne(query, function(err, doc) {
        if (err) {
            console.error("Error fetching file container:", err.message);
            return res.status(500).send({ err: "Server error" });
        }

        if (!doc) {
            console.warn("File container not found for query:", query);
            return res.status(404).send({ err: "File not found" });
        }

        // Check if the document is viewable to the user
        if (!doc.viewableTo(req.user)) {
            console.warn("User does not have access to view this file.");
            return res.status(403).send({ err: "Access denied" });
        }

        // Use the file path from the document's `file.path`
        filePath = doc.file?.name;
		name= doc.file?.name
		fs.access(filePath, fs.constants.F_OK, (err) => {
			if (err) {
			  console.error("File not found:", err);
			  return res.status(404).send({ err: "File not found" });
			}
		
			// Set headers to indicate file type
			res.writeHead(200, {
			  "Content-Type": "text/csv",
			  "Content-Disposition": `attachment; filename="data.csv"`,
			});
		
			// Create a readable stream and pipe it to the response
			const readStream = fs.createReadStream(filePath);
			readStream.pipe(res);
		
			// Handle any errors that occur during streaming
			readStream.on("error", (streamErr) => {
			  console.error("Error reading the file:", streamErr);
			  res.status(500).send({ err: "Unable to send the file" });
			});
		  });
    });
};

exports.datascapeGetLegacyConfig = function (req, res) {
	const defaultLegacyConfig = {
	  "fields-pca": [5, 6, 7, 8],
	  "fields-meta": [1, 2, 3, 4],
	  "fields-meta-id": [],
	  "omit": [],
	  "caption": "Default caption",
	};
  
	const query = req.params.bullet
	  ? { "links.bullet": req.params.bullet }
	  : {
		  "parent.id": req.params.userID,
		  "links.bullet": req.params.datascape,
		};
  
	FileContainers.findOne(query, function (err, doc) {
	  if (err) {
		console.error("Error finding document:", err);
		return res.status(500).send({ err: "Server error" });
	  }
  
	  if (!doc) {
		return res.status(404).send({ err: "File not found" });
	  }
  
	  if (!doc.viewableTo(req.user)) {
		return res.status(404).send({ err: "File not found" });
	  }
  
	  // Check if legacy config is empty
	  if (!doc.displaySettings.legacy || Object.keys(doc.displaySettings.legacy).length === 0) {
		console.log("Empty legacy configuration found, assigning default configuration.");
  
		// Assign default legacy config
		doc.displaySettings.legacy = defaultLegacyConfig;
  
		// Save the updated document
		doc.save(function (saveErr) {
		  if (saveErr) {
			console.error("Error saving updated document:", saveErr);
			return res.status(500).send({ err: "Failed to update configuration" });
		  }
  
		  console.log("Default legacy configuration saved successfully.");
		  return res.send(doc.displaySettings.legacy); // Respond with default config
		});
	  } else {
		console.log("Existing legacy configuration found, sending it.");
		return res.send(doc.displaySettings.legacy); // Respond with existing config
	  }
	});
  };
  

exports.getDatascapeSettings = function(req, res){
    var query = req.params.bulletURL ? {
	    'links.bullet': req.params.bulletURL
	} : {
	    'parent.id': req.params.userID,
	    'links.bullet': req.params.datascape 
	};
    
    FileContainers.findOne( query, function(err, doc){
	
	if( err ){
	    res.redirect('/500');
	    throw new Error( err );
	}

	if( !doc) return res.redirect('/404');

    	var isOwner = req.isAuthenticated() && req.user && req.user._id.toString() === doc.parent.id;

	if( isOwner ){ 
    	    res.render('datascape-settings.ejs', { 
		user: req.user,
		datascape: doc,
		isOwner: isOwner,
		message: req.flash('uploadMessage')
	    });
    	} else {
    	    res.render( 'request-access.ejs', {
    		user: req.user,
		datascape: doc,
    		file: {
    		    name: doc.file.name,
		    requestLink: doc.displaySettings.link + '/request-access'
    		}
    	    });
    	}
    });
}



exports.getFileContainer = function(req, res){
    
    // Construct query
    var query = {
	_id: req.query.id
    }
    
    FileContainers.findOne( query, function(err, doc){
	if( err ){
	    res.status(500).send({err: "Server error"});
	    throw new Error( err );
	}
	
	if( !doc ) return res.status(404).send({err: "File not found"});
	if( !doc.viewableTo( req.user ) )
	    return res.status(404).send({err: "File not found"});
	
	// At this point, no errors
	// we found the doc, and the user,
	// does have access to the file. Yay!

	// Send fileContainer 
	res.send( doc );
    }); 
    
}

exports.getFileContainerSource = function(req, res){
    
    // Construct query
    var query = {
	_id: req.query.id
    }
    
    FileContainers.findOne( query, function(err, doc){
	if( err ){
	    res.status(500).send({err: "Server error"});
	    throw new Error( err );
	}
	
	if( !doc ) return res.status(404).send({err: "File not found"});
	if( !doc.viewableTo( req.user ) )
	    return res.status(404).send({err: "File not found"});
	
	// Send fileContainer 
	doc.getFile( res );
    }); 			    
}

exports.postDatascapeSettings = function(req, res){
    
    if( !req.isAuthenticated() )
	return res.status(403).send({err: "Forbidden"});
    
    var form = new formidable.IncomingForm();

    form.parse(req, function(err, fields) {
	if (err){
	    res.status(500).send({err: "Server error"});
	    console.log("Error in form.parse controllers/fileContaine line 279");
	}
	
	var settings = JSON.parse( fields.revertUponArival );
	var query = {
	    'links.bullet': req.params.datascape
	}
	
	FileContainers.findOne( query, function(fcErr, doc){
	    if( fcErr ){
			res.status(500).send({err: "Server error"});
			console.log("Error in finding a file contrainer controllers/fileContaine line 290");
	    }

	    // Make sure the user exists and they are the parent 
	    if( req.user && doc.parent.id !== req.user._id.toString() )
		return res.status(403).send({err: "Forbidden"});
	    
	    doc.updateSettings( settings, function(updateErr){
		if( updateErr ) {
		    res.status(500).send({err: "Server error"});
		    console.log("Error in updatesettings controllers/fileContaine line 300");
		}	
	    });
	    
	    // no need to wait on emails
	    doc.save(function(saveErr){
		if( saveErr ){
		    return res.status(500).send({err: "Server error"});
		}
		res.send( doc.links.link );
	    });
	});
    });
}

exports.deleteDatascape = function(req, res){

    if( !req.isAuthenticated() && req.user )
	res.redirect('/403');
   
    var query = {
	'links.bullet': req.params.datascape
    }
    
    FileContainers.findOne( query, function(fcErr, doc){
	if( fcErr ){
	    res.redirect('/500' );
	    throw new Error( fcErr );
	}
	
	if( !doc ) return res.redirect( req.user.links.local );
	
	// Make sure the user exists and they are the parent 
	if( req.user && doc.parent.id !== req.user._id.toString() )
	    return res.redirect('/403');
	
	
	    // no need to wait on emails
	doc.remove(function(removeErr){
	    if( removeErr ){
		res.redirect('/500' );
		throw new Error( removeErr );
	    }
	    res.redirect('/profile');
	});
    });
}

exports.getPaginatedFiles = function(req, res) {
    
    // Default to only searching for public datascapes
    var query = {
        '$or': [ 
            {'displaySettings.visibility': 'PUBLIC' }
        ]
    };
    
    // If given a parentID, only search datascapes that are owned by that user
    if (req.query.parentID) {
        query['parent.id'] = req.query.parentID;
    }     
    
    // If parent, display all datascapes
    if (req.user && ( req.query.parentID === req.user._id.toString() )) {
        query['$or'].push( {'displaySettings.visibility': 'PRIVATE' } );
    }

    // Retrieve all data matching the query for inspection
    FileContainers.find(query).lean().exec(function(err, allData) {
        if (err) {
            console.error("Error retrieving all data:", err);
        } else {
            console.log("All Data Retrieved:", allData);

            if (allData && allData.length > 0) {
                console.log("Document Structure Overview:");
                console.log(getStructureOverview(allData[0], 0));  // Start indent at 0 here
            } else {
                console.log("No documents found for the given query.");
            }
        }
    });

    // Print all collections in the database
    mongoose.connection.db.listCollections().toArray(function(err, collections) {
        if (err) {
            console.error("Error listing collections:", err);
        } else {
            console.log("Collections in the database:");
            collections.forEach(function(collection) {
                console.log("- " + collection.name);
            });

            // Retrieve all users and print usernames and (hashed) passwords
            mongoose.model('User').find({}, 'email password').lean().exec(function(err, users) {
                if (err) {
                    console.error("Error retrieving users:", err);
                } else {
                    console.log("User Emails and Passwords:");
                    console.log(JSON.stringify(users, null, 2));  // Print as JSON
                }
            });
        }
    });

    // Print the current database connection string
    console.log("Database Connection String:", mongoose.connection._connectionString || mongoose.connection.client.s.url);

    // Create a new user using the register method
    var User = mongoose.model('User');
    var newUser = User.register("Fitsum", "Abyu", "fitsumabyu914@gmail.com", "123123");

    newUser.save(function(err) {
        if (err) {
            console.error("Error creating new user:", err);
        } else {
            console.log("New User Created:", newUser);
        }
    });

    // Construct paginate params
    var paginateParams = {
        page: parseInt(req.query.page || 0) + 1,
        limit: parseInt(req.query.limit || 30),
        lean: true,
        leanWithId: true,
        sort: { dateAdded: -1 } // Sort from newest to oldest 
    };

    // Perform pagination and send the response
    FileContainers.paginate(query, paginateParams, function(err, docs) {
        if (err) return res.send(err);
        res.send(docs); 
    });    

    // Helper function to print structure overview
    function getStructureOverview(obj, indent) {
        var structure = '';
        for (var key in obj) {
            if (obj.hasOwnProperty(key)) {
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    structure += ' '.repeat(indent) + key + ':\n';
                    structure += getStructureOverview(obj[key], indent + 2);
                } else {
                    structure += ' '.repeat(indent) + key + ' - ' + typeof obj[key] + '\n';
                }
            }
        }
        return structure;
    }
}


exports.addSharedUser = function(req, res){

    var datascapeQuery = {
	'parent.id': req.params.userID,
	'links.bullet': req.params.datascape 
    };
    
    var userQuery = {
	_id: req.params.sharedUserID
    };

    
    FileContainers.findOne( datascapeQuery, function(fcErr, fc){
	if( fcErr ){
	    res.redirect( '/500');
	    throw new Error( fcErr );
	}
	
	if( !fc ) return res.redirect('/404');
	
	var isOwner = req.isAuthenticated() && req.user && req.user._id.toString() === fc.parent.id;
    
	if(!isOwner) return res.redirect('/403');
		
	Users.findOne( userQuery, function( userErr, user){
	    if( userErr ){
		res.redirect( '/500');
		throw new Error( userErr );
	    }
	    
	    if( !user ) return res.redirect('/404');
	    
	    var newSettings = {
		sharedWith: JSON.parse(JSON.stringify( fc.sharedWith ))
	    }
	    
	    newSettings.sharedWith.push( user.email );
	    
	    fc.updateSettings( newSettings, function(updateErr){
		if( updateErr ){
		    res.redirect( '/500');
		    throw new Error( updateErr );
		}

		fc.save(function(saveErr){
		    if( saveErr ){
			res.redirect( '/500' );
			throw new Error( saveErr );
		    } else res.render('requested-user-added.ejs', {user: req.user, addedUser: user, datascape: fc }); 
		});	    
	    });
	});
    });
}

exports.updateThumbnail = function(req, res){

    var query = {
	'_id': req.body.datascapeID,
	'parent.id': ( req.user || {} ).id
    }

    FileContainers.findOne( query, function(err, doc){
	if( err ){
	    res.status(500).send({err: "Server error"});
	    throw new Error( err );
	}
	if( !doc ) return res.status(404).send({err: 'File not found'});
	
	var thumbnailPath = doc.localDataPath + '/files/thumbnails/' + doc._id;
	var base64URL = req.body.rawImageData.replace(/^data:image\/png;base64,/, "");

	fs.writeFile(thumbnailPath, base64URL, "base64", function(writeErr){
	    if( writeErr ){
		res.status(500).send({err: "Error saving image"});
		throw new Error( writeError );
	    }
	    
	    // Keep the auto generated thumbnail just in case 
	    // but change the image path
	    doc.links.thumbnail = doc.publicDataPath + '/files/thumbnails/' + doc._id;
	                             
	    doc.save(function(saveErr){
		if( saveErr ){
		    res.status(500).send({err: "Error saving image"});
		    throw new Error( saveError );
		}	
		
		res.send(doc);
	    });
	});	
    });
}
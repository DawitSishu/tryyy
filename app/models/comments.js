'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var BaseComment = require('./base-comment');

// Define the CommentSchema by extending the BaseComment fields manually
var CommentSchema = new Schema({
    dateAdded: { 
        type: Date, 
        default: Date.now 
    },
    lastUpdated: { 
        type: Date, 
        default: Date.now 
    },
    parent: {
        collectionName: { 
            type: String, 
            required: true 
        },
        id: { 
            type: String, 
            required: true 
        }
    },
    body: { 
        type: String, 
        required: true 
    },
    links: {
        parent: { 
            type: String, 
            required: true 
        }
    },
    subject: { 
        type: String, 
        required: true 
    },
    children: { 
        type: Array, 
        default: [] 
    },
    from: { 
        type: String, 
        required: true 
    }
});

// Method to add a comment
CommentSchema.methods.addComment = function (commentID) {
    this.children.push(commentID);
};

module.exports = mongoose.model('Comment', CommentSchema);

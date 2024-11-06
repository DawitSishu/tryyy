'use strict';

var sharp = require('sharp');

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
}

module.exports = function (path, callback) {
    var imageSize = 200;
    var backgroundColor = { r: 255, g: 255, b: 255, alpha: 1 };

    // Create a base image with a white background
    var baseImage = sharp({
        create: {
            width: imageSize,
            height: imageSize,
            channels: 4,
            background: backgroundColor
        }
    }).png();

    // Generate SVG for random circles to overlay on the base image
    var lineCount = getRandomInt(3, 7);
    var svgContent = '<svg width="' + imageSize + '" height="' + imageSize + '">';
    for (var i = 0; i < lineCount; i++) {
        var color = 'rgb(' + getRandomInt(0, 255) + ',' + getRandomInt(0, 255) + ',' + getRandomInt(0, 255) + ')';
        svgContent += '<circle cx="' + getRandomInt(0, imageSize) + '" cy="' + getRandomInt(0, imageSize) + '" r="4" fill="' + color + '" />';
    }
    svgContent += '</svg>';

    // Apply the SVG overlay to the base image
    baseImage
        .composite([{ input: Buffer.from(svgContent), blend: 'over' }])
        .toFile(path, function (err, info) {
            if (err) return callback(err);
            callback(null, info);
        });
};

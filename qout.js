// server.js
const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const xlsx = require('xlsx');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const SVGtoPDF = require('svg-to-pdfkit');

const app = express();
const upload = multer();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

// Add this mapping at the top of qout.js (after the requires)
const airlineLogos = {
    'Jazeera': 'jazeera.png',
    'Air India Express': 'air-india-express.png',
    'IndiGo': 'indigo.png',
    'Emirates': 'emirates.png',
    'Qatar Airways': 'qatar-airways.png'
};

// Load airports data from Excel
let airports = [];
try {
    const workbook = xlsx.readFile('airports.xlsx');
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    airports = xlsx.utils.sheet_to_json(worksheet).map(item => item.code);
} catch (err) {
    console.error("Error loading airports data:", err);
    airports = ["Kuwait International", "Dubai International", "Delhi International", "Mumbai International"];
}

app.get('/airports', (req, res) => {
    res.json(airports);
});

// Add this near the top with other data loading
let corpNames = [];
try {
    const workbook = xlsx.readFile('corpNames.xlsx');
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    corpNames = xlsx.utils.sheet_to_json(worksheet);
} catch (err) {
    console.error("Error loading corp names data:", err);
    corpNames = [];
}

// Add this new endpoint
app.get('/corp-names', (req, res) => {
    res.json(corpNames);
});

app.post('/generate-pdf', upload.none(), async (req, res) => {
    try {
        const data = JSON.parse(req.body.data);
        const doc = new PDFDocument({ margin: 50 });
        
        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=flight_quotation.pdf');
        
        // Pipe the PDF to the response
        doc.pipe(res);
        
        // Generate the PDF content
        generatePDFContent(doc, data);
        
        // Finalize the PDF
        doc.end();
    } catch (error) {
        console.error(error);
        res.status(500).send('Error generating PDF');
    }
});

function generatePDFContent(doc, data) {
    try {
        // Set margins and initial position
        const margin = 40;
        const pageWidth = doc.page.width - margin * 2;
        let y = margin;

        // Store the original addPage method
        const originalAddPage = doc.addPage;
        
        // Override the addPage method to add footer to each new page
        doc.addPage = function() {
            // Add footer to current page before adding new one
            addFooter(doc);
            
            // Call original addPage
            originalAddPage.call(doc);
            
            // Add footer to the new page
            addFooter(doc);
            
            // Reset y position for new content
            doc.y = margin;

            // Add logo to new page
            addLogo(doc, margin);
        };
        
        // Add logo to the first page
        y = addLogo(doc, margin);
        // Set default font
        doc.font('Helvetica');
        
        // Customer section
        doc.save();
        const customerBgHeight = 30;
        const customerGradient = doc.linearGradient(
            margin, y, 
            margin, y + customerBgHeight
        );
        customerGradient.stop(0, '#f8f9fa')
            .stop(1, '#e9ecef');

        doc.roundedRect(margin, y, pageWidth, customerBgHeight, 5)
            .fill(customerGradient)
            .stroke('#dee2e6');

        doc.font('Helvetica-Bold')
            .fontSize(12)
            .fillColor('#495057')
            .text(`Corporate: ${data.customerName || 'Not specified'} (Account: ${data.customerAccount || 'N/A'})`, margin + 10, y + (customerBgHeight - 10) / 2, {
                width: pageWidth - 20,
                align: 'left'
            });
        doc.restore();
        doc.moveDown(0.5);

        

        // Add flight tables
        data.flights.forEach((flightGroup, groupIndex) => {
            doc.moveDown(0.5);
            if (flightGroup.paxName) {
                doc.font('Helvetica')
                    .fontSize(12)
                    .fillColor('#495057')
                    .text(`Traveler Name: ${flightGroup.paxName}`, margin + 10, doc.y);
                doc.moveDown(0.5);
            }
            // Airline header
            y = doc.y + 10;
            doc.save();
            const airlineBgHeight = 30;
            const airlineGradient = doc.linearGradient(
                margin, y, 
                margin, y + airlineBgHeight
            );

            // Create flight table
            const flightTable = {
                headers: ['Airline', 'Flight', 'Class', 'Date', 'From', 'To', 'Depart', 'Arrival', 'Bag'],
                rows: flightGroup.flights.map(flight => [
                    flightGroup.airline || '-',
                    flight.flightNumber || '-',
                    flight.class || '-',
                    flight.date || '-',
                    flight.from || '-',
                    flight.to || '-',
                    flight.depart || '-',
                    flight.arrival || '-',
                    flight.baggage ? `${flight.baggage} kg` : '-'
                ]),
                colWidths: [70, 60, 60, 69, 60, 60, 60, 70, 50]
            };

            // Draw the flight table
            y = drawTable(doc, flightTable, margin, y, pageWidth);

            // Add Ticket Fare table
            y = doc.y;
            const additionalInfo = flightGroup.additionalInfo || {};
            const fareAmount = additionalInfo.ticketFare ? `${additionalInfo.ticketFare} KWD` : '0.000 KWD';
            
            const fareTable = {
                headers: ['Ticket Fare', 'Amount'],
                rows: [[
                    'Ticket Fare:',
                    fareAmount
                ]],
                colWidths: [100, 150],
                headerColors: {
                    background: '#005DA0',
                    text: '#ffffff'
                },
                cellColors: {
                    background: '#ffffff',
                    text: '#000000'
                }
            };

            // Draw the Ticket Fare table (right-aligned)
            const fareTableWidth = 250;
            const fareTableX = margin + pageWidth - fareTableWidth;
            y = drawSimpleTable(doc, fareTable, fareTableX, y, fareTableWidth);
            
            y += 15;

            // Modern Additional Information Section (replace the existing table-based version)
            y = doc.y + 100; // Add some space before the info section

            // Information Items with clean styling
            const infoItems = [
                { label: 'THIS FARE CAN BE CHANGED'},
                { label: 'Baggage Allowance', value: additionalInfo.baggagePieces ? 
                    `${additionalInfo.baggagePieces} pieces × ${additionalInfo.baggageKg} kg each` : 'Not specified' },
                { label: 'Change Policy', value: additionalInfo.changeNoPenalty ? 
                    'No penalty (only fare difference)' : 'Standard change fees apply' },
                { label: 'Change for No Show', value: additionalInfo.changeNoShowFee ? 
                    `${additionalInfo.changeNoShowFee} KWD + fare difference` : 'Not specified' },
                { label: 'Cancellation Fee', value: additionalInfo.cancellationFee ? 
                    `${additionalInfo.cancellationFee} KWD` : 'Not specified' },
                { label: 'No Show Fee', value: additionalInfo.noShowFee ? 
                    `${additionalInfo.noShowFee} KWD` : 'Not specified' }
            ];

            // Draw information items with clean, minimal styling
            infoItems.forEach((item, index) => {
                // Label (bold and dark gray)
                doc.font('Helvetica-Bold')
                .fontSize(10)
                .fillColor('#333333')
                .text(`${item.label}:`, margin + 10, y, {
                    width: 160,
                    align: 'left'
                });
                
                // Value (regular font, slightly lighter color)
                doc.font('Helvetica')
                .fontSize(10)
                .fillColor('#555555')
                .text(item.value, margin + 180, y, {
                    width: pageWidth - 190,
                    align: 'left'
                });
                
                y += 20;
                
                // Add subtle separator (except after last item)
                if (index < infoItems.length - 1) {
                    doc.moveTo(margin + 10, y - 5)
                    .lineTo(margin + pageWidth - 10, y - 5)
                    .stroke('#eeeeee')
                    .lineWidth(0.5);
                }
            });

            y += 10;

            // Add page break if not the last group
            if (groupIndex < data.flights.length - 1) {
                doc.addPage();
                y = margin;
            }
        });

        // Finalize by adding footer to the last page
        addFooter(doc);
    } catch (error) {
        console.error('Error generating PDF content:', error);
        throw error;
    }
}

// Helper function for simple tables
function drawSimpleTable(doc, table, x, y, tableWidth) {
    const rowHeight = 30;
    const headerHeight = 25;
    const blueColor = '#005DA0';
    
    // Draw table header
    doc.save();
    doc.rect(x, y, tableWidth, headerHeight)
       .fill(table.headerColors.background)
       .stroke(blueColor);
    
    let currentX = x;
    doc.font('Helvetica-Bold')
       .fontSize(11)
       .fillColor(table.headerColors.text);
    
    table.headers.forEach((header, i) => {
        doc.text(header.toUpperCase(), currentX + 10, y + (headerHeight - 10) / 2, {
            width: table.colWidths[i] - 20,
            align: 'left'
        });
        currentX += table.colWidths[i];
    });
    doc.restore();
    
    y += headerHeight;
    
    // Draw table rows
    table.rows.forEach(row => {
        // Draw row background and border
        doc.save();
        doc.rect(x, y, tableWidth, rowHeight)
           .fill(table.cellColors.background)
           .stroke(blueColor);
        
        currentX = x;
        doc.font('Helvetica')
           .fontSize(11)
           .fillColor(table.cellColors.text);
        
        row.forEach((cell, i) => {
            doc.text(cell, currentX + 10, y + (rowHeight - 10) / 2, {
                width: table.colWidths[i] - 20,
                align: 'left'
            });
            
            // Draw vertical line if not last column
            if (i < row.length - 1) {
                doc.moveTo(currentX + table.colWidths[i], y)
                   .lineTo(currentX + table.colWidths[i], y + rowHeight)
                   .stroke(blueColor);
            }
            
            currentX += table.colWidths[i];
        });
        
        doc.restore();
        y += rowHeight;
    });
    
    doc.y = y + 10;
    return y;
}

// Add this new function to handle logo placement
function addLogo(doc, margin) {
    try {
        let y = margin;
        const leftAlign = margin; // Left alignment position
        
        // Add logo at the top left
        const logoPath = path.join(__dirname, 'public', 'logo.png');
        if (fs.existsSync(logoPath)) {
            // Add logo (left-aligned)
            doc.image(logoPath, 
                leftAlign, 
                y,
                { 
                    width: 140
                }
            );
            y += 90; // Space after logo (logo height + padding)
            
            // Add "FLIGHT QUOTATION" title left-aligned below logo
            doc.fontSize(25)
               .font('Helvetica-Bold')
               .fillColor('#000000')
               .text('FLIGHT QUOTATION', leftAlign, y);
            y += 35; // Space after title
            
            // Add bold line in the same blue color (left-aligned, full width)
            doc.lineWidth(1.5)
               .strokeColor('#005DA0')
               .moveTo(leftAlign, y)
               .lineTo(doc.page.width - margin, y)
               .stroke();
            y += 15; // Space after line
        } else {
            // Fallback text (left-aligned)
            doc.fontSize(14)
               .fillColor('#005DA0')
               .text('Flight Quotation System', leftAlign, y);
            y += 30;
            
            // Add bold line in the same blue color for fallback case
            doc.lineWidth(3)
               .strokeColor('#005DA0')
               .moveTo(leftAlign, y)
               .lineTo(doc.page.width - margin, y)
               .stroke();
            y += 15;
        }
        return y; // Return the new Y position
    } catch (error) {
        console.error('Error adding logo:', error);
        return margin; // Return default margin if error occurs
    }
}

function addFooter(doc) {
    const margin = 1;
    const footerHeight = 60;
    const footerY = doc.page.height - margin - footerHeight;
    
    try {
        // Add footer image
        doc.image('public/footer.png', 
            margin, 
            footerY, 
            { 
                width: doc.page.width - margin * 2,
                height: footerHeight
            }
        );
    } catch (error) {
        console.error('Error adding footer image:', error);
        // Fallback: Add simple text footer if image fails
        doc.fontSize(10)
           .fillColor('#666666')
           .text('Flight Quotation', margin, footerY, {
               width: doc.page.width - margin * 2,
               align: 'center'
           });
    }
}

function drawTable(doc, table, margin, y, pageWidth) {
    const rowHeight = 35;
    const cellPadding = 8;
    const headerHeight = 30;
    const tableWidth = table.colWidths.reduce((sum, width) => sum + width, 0);
    const blueColor = '#005DA0';
    const logoHeight = 40; // Height for airline logos

    // Draw table header with square corners
    doc.save();
    doc.rect(margin, y, tableWidth, headerHeight)
       .fill(blueColor)
       .stroke(blueColor);

    // Draw header text (white and bold)
    let currentX = margin;
    doc.font('Helvetica-Bold')
       .fontSize(11)
       .fillColor('#ffffff');

    const uppercaseHeaders = table.headers.map(header => header.toUpperCase());
    
    uppercaseHeaders.forEach((header, i) => {
        doc.text(header, currentX + cellPadding, y + (headerHeight - 10) / 2, { 
            width: table.colWidths[i] - cellPadding * 2,
            align: 'left'
        });
        currentX += table.colWidths[i];
    });
    doc.restore();
    
    // Draw rows with alternating background colors
    doc.font('Helvetica')
       .fontSize(10);
    
    y += headerHeight;
    
    table.rows.forEach((row, rowIndex) => {
        const rowColor = rowIndex % 2 === 0 ? '#f8f9fa' : '#ffffff';
        
        // Draw row background
        doc.save();
        doc.rect(margin, y, tableWidth, rowHeight)
           .fill(rowColor)
           .stroke('#ffffff'); // Stroke with white to prevent covering borders
        doc.restore();
        
        // Draw cell borders
        doc.save();
        doc.strokeColor(blueColor)
           .lineWidth(0.5);
        
        let currentX = margin;
        row.forEach((cell, i) => {
            // Special handling for airline column (first column)
            if (i === 0 && airlineLogos[cell]) {
                try {
                    const logoPath = path.join(__dirname, 'public', 'airline-logos', airlineLogos[cell]);
                    if (fs.existsSync(logoPath)) {
                        const logoWidth = table.colWidths[i] - cellPadding * 2;
                        const logoX = currentX + cellPadding;
                        const logoY = y + (rowHeight - logoHeight) / 2;
                        
                        doc.image(logoPath, logoX, logoY, {
                            width: logoWidth,
                            height: logoHeight,
                            fit: [logoWidth, logoHeight]
                        });
                    } else {
                        // Fallback to text if logo not found
                        doc.fillColor('#212529')
                           .text(cell, currentX + cellPadding, y + (rowHeight - 10) / 2, {
                               width: table.colWidths[i] - cellPadding * 2,
                               align: 'left'
                           });
                    }
                } catch (err) {
                    console.error('Error loading airline logo:', err);
                    // Fallback to text if error occurs
                    doc.fillColor('#212529')
                       .text(cell, currentX + cellPadding, y + (rowHeight - 10) / 2, {
                           width: table.colWidths[i] - cellPadding * 2,
                           align: 'left'
                       });
                }
            } else {
                // Normal text cells
                doc.fillColor('#212529')
                   .text(cell, currentX + cellPadding, y + (rowHeight - 10) / 2, {
                       width: table.colWidths[i] - cellPadding * 2,
                       align: 'left'
                   });
            }
            
            // Draw vertical line
            if (i < row.length - 1) { // Don't draw after last cell
                doc.moveTo(currentX + table.colWidths[i], y)
                   .lineTo(currentX + table.colWidths[i], y + rowHeight)
                   .stroke();
            }
            
            currentX += table.colWidths[i];
        });
        
        // Draw horizontal line at bottom
        doc.moveTo(margin, y + rowHeight)
           .lineTo(margin + tableWidth, y + rowHeight)
           .stroke();
        
        doc.restore();
        
        y += rowHeight;
        
        // Page break handling (keep existing code)
        if (y > doc.page.height - margin - rowHeight) {
            doc.addPage();
            y = addLogo(doc, margin);
            
            doc.save();
            doc.rect(margin, y, tableWidth, headerHeight)
               .fill(blueColor)
               .stroke(blueColor);

            currentX = margin;
            doc.font('Helvetica-Bold')
               .fontSize(11)
               .fillColor('#ffffff');
            
            uppercaseHeaders.forEach((header, i) => {
                doc.text(header, currentX + cellPadding, y + (headerHeight - 10) / 2, { 
                    width: table.colWidths[i] - cellPadding * 2,
                    align: 'left'
                });
                currentX += table.colWidths[i];
            });
            
            doc.restore();
            y += headerHeight;
        }
    });
    
    doc.y = y + 15;
    return y;
}

function drawModernInfoTable(doc, table, margin, y, pageWidth) {
    const rowHeight = 22;
    const iconPadding = 5;
    
    doc.font('Helvetica');
    
    table.rows.forEach(row => {
        // Draw icon if present
        if (row.icon) {
            doc.font('Helvetica')
               .fontSize(12)
               .fillColor('#495057')
               .text(row.icon, margin + iconPadding, y, {
                   width: table.iconWidth,
                   align: 'left'
               });
        }
        
        // Draw label with modern styling
        const labelX = margin + (row.icon ? table.iconWidth + 10 : 0);
        doc.font('Helvetica-Bold')
           .fontSize(10)
           .fillColor('#6c757d') // Medium gray
           .text(row.label, labelX, y, {
               width: table.labelWidth - (row.icon ? table.iconWidth + 10 : 0),
               align: 'left'
           });
        
        // Draw value with conditional styling
        const valueX = labelX + table.labelWidth;
        const valueFontSize = 10;
        
        if (row.highlight !== undefined) {
            doc.font(row.highlight ? 'Helvetica-Bold' : 'Helvetica')
               .fillColor(row.highlight ? '#28a745' : '#dc3545') // Green for positive, red for negative
               .fontSize(valueFontSize);
        } else {
            doc.font('Helvetica')
               .fillColor('#212529') // Dark gray
               .fontSize(valueFontSize);
        }
        
        doc.text(row.value, valueX, y, {
            width: table.valueWidth,
            align: 'left'
        });
        
        y += rowHeight;
        
        // Add subtle divider between rows
        if (y < doc.page.height - margin - rowHeight) {
            doc.moveTo(margin, y + 2)
                .lineTo(margin + pageWidth, y + 2)
                .stroke('#f1f3f5')
                .lineWidth(0.5);
            y += 5;
        }
        
        // Check if we need a new page
        if (y > doc.page.height - margin - rowHeight) {
            doc.addPage();
            y = margin;
        }
    });
    
    doc.y = y + 10;
    return y;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
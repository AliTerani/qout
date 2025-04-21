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
        //addLogo(doc, margin);
        y = addLogo(doc, margin); // Adjust y position after logo
        // Set default font
        doc.font('Helvetica');
        
        
        // Reset position for next content
        
        doc.save();
        const customerBgHeight = 30;
        const customerGradient = doc.linearGradient(
            margin, y, 
            margin, y + customerBgHeight
        );
        customerGradient.stop(0, '#f8f9fa') // Light gray
            .stop(1, '#e9ecef'); // Slightly darker gray

        doc.roundedRect(margin, y, pageWidth, customerBgHeight, 5)
            .fill(customerGradient)
            .stroke('#dee2e6'); // Light border

        doc.font('Helvetica-Bold')
            .fontSize(12)
            .fillColor('#495057') // Dark gray text
            .text(`Customer: ${data.customerName || 'Not specified'}`, margin + 10, y + (customerBgHeight - 10) / 2, {
                width: pageWidth - 20,
                align: 'left'
            });
        doc.restore();
        doc.moveDown(1.5);

        // Add flight tables
        data.flights.forEach((flightGroup, groupIndex) => {
            // Airline header
            y = doc.y;
            doc.save();
            const airlineBgHeight = 30;
            const airlineGradient = doc.linearGradient(
                margin, y, 
                margin, y + airlineBgHeight
            );
            airlineGradient.stop(0, '#f8f9fa') // Light gray
                .stop(1, '#e9ecef'); // Slightly darker gray
        
            doc.roundedRect(margin, y, pageWidth, airlineBgHeight, 5)
                .fill('#005DA0')
                .stroke('#dee2e6'); // Light border
        
            // Add airline icon (blue)
            const airlineSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#FFFFFF">
                <path d="M22 16v-2l-8.5-5V3.5c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5V9L2 14v2l8.5-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13.5 19v-5.5L22 16z"/>
            </svg>`;
        
            SVGtoPDF(doc, airlineSVG, margin + 10, y + (airlineBgHeight - 16) / 2, { width: 16, height: 16 });
        
            doc.font('Helvetica-Bold')
                .fontSize(12)
                .fillColor('#FFFFFF') // Blue text to match icon
                .text(`Airline: ${flightGroup.airline}`, margin + 30, y + (airlineBgHeight - 10) / 2, {
                    width: pageWidth - 40,
                    align: 'left'
                });
            doc.restore();
            doc.moveDown(0.8);

            // Create flight table with optimized column widths
            const flightTable = {
                headers: ['Flight', 'Class', 'Date', 'From', 'To', 'Depart', 'Arrival', 'Bag'],
                rows: flightGroup.flights.map(flight => [
                    flight.flightNumber || '-',
                    flight.class || '-',
                    flight.date || '-',
                    flight.from || '-',
                    flight.to || '-',
                    flight.depart || '-',
                    flight.arrival || '-',
                    flight.baggage ? `${flight.baggage} kg` : '-'
                ]),
                colWidths: [60, 60, 80, 90, 90, 60, 60, 60] // Adjusted widths to fit page
            };

            // Draw the flight table
            y = drawTable(doc, flightTable, margin, y + 20, pageWidth);

            // Add Additional Information section
            y = doc.y + 15; // Add more space before this section

            // Section header with modern styling
            doc.save();
            const sectionHeaderHeight = 25;
            const sectionHeaderGradient = doc.linearGradient(
                margin, y, 
                margin, y + sectionHeaderHeight
            );
            sectionHeaderGradient.stop(0, '#f8f9fa') // Light gray
                .stop(1, '#e9ecef'); // Slightly darker gray

            doc.roundedRect(margin, y, pageWidth, sectionHeaderHeight, 3)
                .fill(sectionHeaderGradient)
                .stroke('#dee2e6'); // Light border

            doc.font('Helvetica-Bold')
                .fontSize(12)
                .fillColor('#495057') // Dark gray text
                .text('Additional Information', margin + 10, y + (sectionHeaderHeight - 10) / 2, {
                    width: pageWidth - 20,
                    align: 'left'
                });
            doc.restore();

            y += sectionHeaderHeight + 10;

            // Create additional info table with modern styling
            const additionalInfo = flightGroup.additionalInfo || {};
            const infoTable = {
                rows: [
                    { 
                        label: 'Ticket Fare:', 
                        value: additionalInfo.ticketFare ? `${additionalInfo.ticketFare} KWD` : 'Not specified',
                        
                    },
                    { 
                        label: 'Baggage Allowance:', 
                        value: additionalInfo.baggagePieces ? 
                            `${additionalInfo.baggagePieces} pieces × ${additionalInfo.baggageKg} kg each` : 
                            'Not specified',
                        
                    },
                    { 
                        label: 'Change Policy:', 
                        value: additionalInfo.changeNoPenalty ? 
                            'No penalty (only fare difference)' : 
                            'Standard change fees apply',
                        highlight: additionalInfo.changeNoPenalty
                    },
                    { 
                        label: 'Change for No Show:', 
                        value: additionalInfo.changeNoShowFee ? 
                            `${additionalInfo.changeNoShowFee} KWD + fare difference` : 
                            'Not specified',
                        
                    },
                    { 
                        label: 'Cancellation Fee:', 
                        value: additionalInfo.cancellationFee ? 
                            `${additionalInfo.cancellationFee} KWD` : 
                            'Not specified',
                        
                    },
                    { 
                        label: 'No Show Fee:', 
                        value: additionalInfo.noShowFee ? 
                            `${additionalInfo.noShowFee} KWD` : 
                            'Not specified',
                        
                    }
                ],
                labelWidth: 180,
                valueWidth: pageWidth - 180 - margin,
                iconWidth: 20
            };

            // Draw the additional info table with modern styling
            y = drawModernInfoTable(doc, infoTable, margin, y, pageWidth);

            // Add a subtle divider after the section
            doc.moveTo(margin, y + 10)
                .lineTo(margin + pageWidth, y + 10)
                .stroke('#e9ecef')
                .lineWidth(1);
            y += 20;
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

// Add this new function to handle logo placement
function addLogo(doc, margin) {
    try {
        let y = margin;
        // Add logo at the top
        const logoPath = path.join(__dirname, 'public', 'logo.png');
        if (fs.existsSync(logoPath)) {
            doc.image(logoPath, 
                margin, 
                y,
                { 
                    width: 130,
                    align: 'center'
                }
            );
            y += 50; // Add space after logo (logo height + padding)
        } else {
            // Fallback text
            doc.fontSize(14)
               .fillColor('#005DA0')
               .text('Flight Quotation System', margin, y, {
                   width: doc.page.width - margin * 2,
                   align: 'center'
               });
            y += 30;
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
    const rowHeight = 25; // Increased row height for better spacing
    const cellPadding = 8;
    const headerHeight = 30;
    
    // Calculate total table width
    const tableWidth = table.colWidths.reduce((sum, width) => sum + width, 0);
    
    // Draw table header with modern styling
    doc.save();
    doc.roundedRect(margin, y, tableWidth, headerHeight, 5)
       .fill('#ffffff'); // Modern blue header
    
    // Draw header text (white)
    let currentX = margin;
    doc.font('Helvetica-Bold')
       .fontSize(11)
       .fillColor('#000000');
    
    table.headers.forEach((header, i) => {
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
        // Alternate row colors
        const rowColor = rowIndex % 2 === 0 ? '#f8f9fa' : '#ffffff';
        
        doc.save();
        doc.rect(margin, y, tableWidth, rowHeight)
           .fill(rowColor);
        doc.restore();
        
        // Draw cell borders (light gray)
        doc.save();
        doc.strokeColor('#dee2e6')
           .lineWidth(0.5);
        
        let currentX = margin;
        row.forEach((cell, i) => {
            // Draw cell content
            doc.fillColor('#212529') // Dark gray text
               .text(cell, currentX + cellPadding, y + (rowHeight - 10) / 2, {
                   width: table.colWidths[i] - cellPadding * 2,
                   align: 'left'
               });
            
            // Draw right border
            doc.moveTo(currentX + table.colWidths[i], y)
               .lineTo(currentX + table.colWidths[i], y + rowHeight)
               .stroke();
            
            currentX += table.colWidths[i];
        });
        
        // Draw bottom border
        doc.moveTo(margin, y + rowHeight)
           .lineTo(margin + tableWidth, y + rowHeight)
           .stroke();
        
        doc.restore();
        
        y += rowHeight;
        
        // Check if we need a new page
        if (y > doc.page.height - margin - rowHeight) {
            doc.addPage();
            y = addLogo(doc, margin); // Add logo and get new Y position
            totalHeight = headerHeight;
            
            // Redraw header on new page
            doc.save();
            doc.roundedRect(margin, y, tableWidth, headerHeight, {
                radius: 5,
                fill: '#ffffff',
                stroke: '#dee2e6',
                lineWidth: 1
            });
            
            currentX = margin;
            doc.font('Helvetica-Bold')
               .fontSize(11)
               .fillColor('#000000');
            
            table.headers.forEach((header, i) => {
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
    
    doc.y = y + 15; // Extra space after table
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
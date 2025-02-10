#!/usr/bin / env node

try {
    new TextDecoder('ascii');
} catch {
    const TD = globalThis.TextDecoder;
    globalThis.TextDecoder = class {
        constructor(encoding, options) {
            this.td = encoding === 'ascii' ? null : new TD(encoding, options);
        }

        decode(input, options) {
            if (this.td) return this.td.decode(input, options);
            let r = '';
            for (let i = 0; i < input.length; i++) r += String.fromCharCode(input[i]);
            return r;
        }
    };
}

const path = require('path');

const express = require('express');
const app = express();

const fetch = require("node-fetch");

const mdns = require('mdns-js');
const { v4: uuidv4 } = require('uuid');

const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
const cors = require('cors');
const fs = require('fs');
//const PDFDocument = require('pdfkit');
const { PDFDocument, rgb } = require('pdf-lib');
const { Console } = require('console');
const { json } = require('body-parser');
require( 'console-stamp' )( console );

//const zlib = require('zlib');

// Komprimieren
//function compress () { return zlib.gzipSync(data);}

// Dekomprimieren
//function decompress () {return zlib.gunzipSync(compress);}

const multer = require('multer');


let globalPruefplan = null; // Globale Variable

// Konfiguration für das Speichern der hochgeladenen Datei
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(process.cwd(), 'pruefungen', 'speichern'); // Dynamischer Pfad
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      cb(null, file.originalname);
    }
  });


// Add this function near the top with other requires and initial setup
function ensurePruefungenDirectory() {
    const dir = 'pruefungen/speichern';
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
    }
}

// Vor der Verwendung von multer sicherstellen, dass das Verzeichnis existiert
const uploadDir = path.join(process.cwd(), 'pruefungen', 'speichern');
ensurePruefungenDirectory(uploadDir);

//Function
function createJsonFromFilenames(searchDirectory, saveDirectory) {
    const directory = path.join(process.cwd(),  searchDirectory);

    // Lese das Verzeichnis
    fs.readdir(directory, (err, files) => {
        if (err) {
            console.error("Fehler beim Lesen des Verzeichnisses: ", err);
            return;
        }
        
        let result = {};
        let index = 1;

        // Filtere JSON-Dateien und entferne die Dateiendungen
        files.forEach(file => {
            if (path.extname(file) === '.json') {
                const filenameWithoutExt = path.basename(file, '.json');
                result[`Pruefplan${index}`] = [filenameWithoutExt];
                index++;
            }
        });

        // Schreibe das Ergebnis in eine neue JSON-Datei
        fs.writeFile(path.join(process.cwd(), saveDirectory, 'result.json'), JSON.stringify(result, null, 2), (err) => {
            if (err) {
                console.error("Fehler beim Schreiben der JSON-Datei: ", err);
            } else {
                console.log("Die JSON-Datei wurde erfolgreich geschrieben!");
            }
        });
    });
}

async function createPDF(data, outputFilePath, name) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([900, 2000]); // Seitenformat (Breite, Höhe)

    // Titel des PDFs
    page.drawText(name, {
        x: 20,
        y: 1950, // Position y
        size: 16,
        color: rgb(0, 0, 0),
        lineHeight: 20,
    });

    let yOffset = 1950;

    // JSON-Inhalte iterieren
    for (const section in data) {
        const items = data[section];

        // Tabellenüberschriften und Zeilen vorbereiten
        let headers = [section, 'Benötigt', 'Erfüllt', 'Kommentar', 'Daten'];
        const rows = [];

        for (const key in items) {
            const item = items[key];
            if (typeof item === 'object') {
                const row = [
                    item.Beschreibung || '',
                    item.Benötigt !== undefined ? item.Benötigt.toString() : '',
                    item.erfuellt !== undefined ? item.erfuellt.toString() : '',
                    item.Kommentar !== undefined ? item.Kommentar.toString() : '-'
                ];
                    if (item.Typ === 'Foto' && item.value && item.value.startsWith('data:image')) {
                        row.push(item.value); // Base64-String
                        yOffset -= 50;
                    }
                    else if (item.Typ === 'Barcode'){
                        row.push(item.Barcode); // Barcode-Text
                    }
                        else {
                        row.push('-'); // Keine Daten
                    }
                
                rows.push(row);
            }
        }

        // Tabelle zeichnen
        yOffset -= 20; // Abstand nach oben für die Tabelle
        await createTable(page, headers, rows, 50, yOffset - 120, pdfDoc);

        // Neue Seite, wenn Platz knapp wird
        if (yOffset < 50) {
            yOffset = 1900; // Zurücksetzen auf die nächste Seite
            pdfDoc.addPage([900, 2000]); // Neue Seite hinzufügen
        } else {
            yOffset -= rows.length * 50 + 50; // Abstand für die nächste Abschnittsüberschrift
        }
    }

    // Speichere das Dokument
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputFilePath, pdfBytes);
    console.log(`PDF wurde erstellt: ${outputFilePath}`);
}

// Funktion zum Zeichnen der Tabelle
async function createTable(page, headers, rows, startX, startY, pdfDoc) {
    let y = startY;

    // Tabellenüberschriften
    if (headers.length > 1) {
        headers.forEach((header, i) => {
            page.drawText(header, {
                x: startX + i * 190,
                y: y,
                size: 8,
                color: rgb(0, 0, 0),
            });
        });
        y -= 20; // Abstand nach den Überschriften
    }

    // Tabellenzeilen
    for (const row of rows) {
        for (const [i, cell] of row.entries()) {
            if (cell.startsWith('data:image')) {
                // Wenn der Wert in der Spalte "Daten" ein Bild ist
                const base64Data = cell.split(';base64,').pop();
                const buffer = Buffer.from(base64Data, 'base64');
                const image = await pdfDoc.embedPng(buffer); // Bild in PDF einfügen

                // Bild in die "Daten"-Spalte einfügen (Größe anpassen)
                const imgDims = image.scale(0.3); // Größe anpassen
                page.drawImage(image, {
                    x: startX + i * 190,
                    y: y - imgDims.height,
                    width: imgDims.width,
                    height: imgDims.height,
                }
            );
                y -= imgDims.height + 20; // Abstand für das Bild (anpassen, je nach Bildhöhe)
            } else {
                // Normaler Text in der Zelle anzeigen
                page.drawText(cell, {
                    x: startX + i * 190,
                    y: y,
                    size: 6,
                    color: rgb(0, 0, 0),
                });
            }
        }
        y -= 20; // Abstand für die nächste Zeile
    }
    
    // Füge Abstand zwischen den Kategorien hinzu
    y -= 120; // Zusätzlicher Abstand nach der Kategorie
}
//------------------------------------------------------------------------------------------
//------------------------------------------------------------------------------------------
//------------------------------------------------------------------------------------------

  // Funktion zum Sammeln der Dateinamen und Erstellen von Pruefplan-Einträgen
  function collectJsonFileNames(folderPath, existingJson) {
    try {
        const files = fs.readdirSync(folderPath);
        let planCount = 0;

        // Zähle die bestehenden "PruefplanX"-Einträge
        for (const key in existingJson) {
            if (key.startsWith("Pruefplan")) {
                const number = parseInt(key.replace("Pruefplan", ""), 10);
                if (number > planCount) {
                    planCount = number; // Aktualisiere den Zähler, um die höchste Nummer zu behalten
                }
            }
        }

        // Erstelle ein Set von vorhandenen Dateinamen
        const existingFileNames = new Set(files.map(file => path.basename(file, '.json')));

        // Entferne nicht mehr vorhandene Einträge aus existingJson
        for (const key in existingJson) {
            if (!existingFileNames.has(existingJson[key][0])) {
                delete existingJson[key];
            }
        }

        for (const file of files) {
            if (path.extname(file) === '.json') {
                // Den Dateinamen ohne die Erweiterung hinzufügen
                const fileNameWithoutExtension = path.basename(file, '.json');

                // Überprüfen, ob ein Eintrag für diese Datei bereits existiert
                const existingKey = Object.keys(existingJson).find(key => existingJson[key][0] === fileNameWithoutExtension);

                if (!existingKey) {
                    // Erhöhe die Plan-Nummer und erstelle den neuen Schlüssel
                    planCount++;
                    const newKey = `Pruefplan${planCount}`;

                    // Füge den neuen Schlüssel zum bestehenden JSON hinzu
                    existingJson[newKey] = [fileNameWithoutExtension]; // Hier kannst du anpassen, wie die Werte strukturiert werden sollen
                }
            }
        }

        // Schreiben der aktualisierten JSON in die Datei
    fs.writeFileSync(path.join(process.cwd(), 'Pruefplaeneverzeichnis_Test_.json'), JSON.stringify(existingJson, null, 2));
    console.log('Die aktualisierte JSON wurde in "Pruefplaeneverzeichnis_Test_.json" geschrieben.');

    } catch (error) {
        console.error('Fehler beim Einlesen der JSON-Dateien:', error);
    }
}

// Beispiel zum Einlesen der bestehenden JSON-Datei
//const existingJsonFilePath = 'Pruefplaeneverzeichnis_Test_.json'; // Pfad zur JSON-Datei

/* let existingJson = {};
try {
    existingJson = JSON.parse(fs.readFileSync(existingJsonFilePath, 'utf-8'));
} catch (error) {
    console.error('Fehler beim Einlesen der bestehenden JSON-Datei:', error);
} */


//const upload = multer({ storage });
const uploadStorage = multer({ storage: storage });

var hostid_file = "hostid.json";
var hostid;

// See if the file exists
if(fs.existsSync(hostid_file)){
    var hostid_json = JSON.parse(fs.readFileSync(hostid_file));
    hostid = hostid_json["hostid"];
}else{
    hostid = uuidv4();
    var obj = {};
    obj["hostid"] = hostid;
    fs.writeFileSync(hostid_file, JSON.stringify(obj));
}


// Add this line right before the app.listen() call
ensurePruefungenDirectory();

const corsOptions = {
    methods: ['GET', 'POST'], // Erlaube bestimmte Methoden
    credentials: true // Erlaube das Senden von Cookies
};

app.use(cors(corsOptions));
app.use(bodyParser.urlencoded({limit: '100mb', extended: true}));
app.use(bodyParser.json({limit: '100mb'}));
const port = process.env.PORT || 4001;
app.listen(port, () => {
    console.log('Server für SAM-KI-Check');
    console.log("(c)2023, 2024 David Breunig, Fraunhofer IPA");
    console.log("Beta v0.1.5");
    console.log(`Host-Id: ${hostid}`);
    console.log(`Listener auf ${port}`);
    console.log('PORT als Umgebungsvariable für anderen Port');
});

app.get('/health', async (req, res) => {
    console.log("GET " + req.url);
    try {
        res.status(200);
    } catch (err) {
        console.error(err);
        res.status(500).send(err);
    }
});

app.get('/Pruefplaeneverzeichnis_Test', async (req, res) => {
    console.log("GET " + req.url);
    console.log("GET Pruefplaeneverzeichnis_Test.json" + req.url);
    try {

        const existingJsonFilePath = 'Pruefplaeneverzeichnis_Test_.json'; // Pfad zur JSON-Datei

        let existingJson = {};
        try {
            existingJson = JSON.parse(fs.readFileSync(existingJsonFilePath, 'utf-8'));
        } catch (error) {
            console.error('Fehler beim Einlesen der bestehenden JSON-Datei:', error);
        }

        const folderPath = './pruefplaene'; // Pfad zum Ordner mit den JSON-Dateien
        collectJsonFileNames(folderPath, existingJson);

        const pruefplaene = JSON.parse(fs.readFileSync('Pruefplaeneverzeichnis_Test_.json', 'utf-8'));
        res.status(200).json(pruefplaene);
       /* if (req.params.Pruefplaeneverzeichnis.indexOf('..') != -1) {
            console.log("Pruefplaeneverzeichnis not found");
            res.status(404).send(err);
        }
        console.log("OK");
        res.status(200).send(fs.readFileSync("Pruefplaeneverzeichnis.json" + req.params.Pruefplaeneverzeichnis)); */
    } catch (err) {
        console.error(err);
        res.status(500).send(err);
    }
});
// Create Zwischenspeicher Verzeichnis
app.get('/createZwischenspeicherverzeichnis_List', async (req, res) => {
    console.log("GET " + req.url);
    console.log("Create Zwischenspeicherverzeichnis result.json" + req.url);
    try {
        //createJsonFromFilenames('pruefungen/speichern');
        createJsonFromFilenames('pruefungen/speichern','');
    } catch (err) {
        console.error(err);
        res.status(500).send(err);
    }
    
});
// Get Zwischenspeicher Verzeichnis
app.get('/Zwischenspeicherverzeichnis_List', async (req, res) => {
    console.log("GET " + req.url);
    console.log("GET Zwischenspeicherverzeichnis_Test.json" + req.url);

    try {
        //const zg_pruefplaene = JSON.parse(fs.readFileSync('pruefungen/speichern/result.json', 'utf-8'));
        const zg_pruefplaene = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'result.json'), 'utf-8'));
        res.status(200).json(zg_pruefplaene);
        //console.log("send zg_List")
        //console.log(zg_pruefplaene)
       /* if (req.params.Pruefplaeneverzeichnis.indexOf('..') != -1) {
            console.log("Pruefplaeneverzeichnis not found");
            res.status(404).send(err);
        }
        console.log("OK");
        res.status(200).send(fs.readFileSync("Pruefplaeneverzeichnis.json" + req.params.Pruefplaeneverzeichnis));  */
    } catch (err) {
        console.error(err);
        res.status(500).send(err);
    }
    
});
/*
app.get('/pruefplaene/Servicegeräte', async (req, res) => { //löschen?
  console.log("GET Servicegeräte.json" + req.url);
  try {
      const pruefplan = JSON.parse(fs.readFileSync('pruefplaene/Servicegeräte.json', 'utf-8'));
  res.status(200).json(pruefplan);
     /* if (req.params.Pruefplaeneverzeichnis.indexOf('..') != -1) {
          console.log("Pruefplaeneverzeichnis not found");
          res.status(404).send(err);
      }
      console.log("OK");
      res.status(200).send(fs.readFileSync("Pruefplaeneverzeichnis.json" + req.params.Pruefplaeneverzeichnis)); */
      /*
  } catch (err) {
      console.error(err);
      res.status(500).send(err);
  }
});
*/
app.get('/pruefplaene/:pruefplan', async (req, res) => {
    console.log("GET /pruefplaene");
    try {
        const pruefplan = req.params.pruefplan;
            const filePath = `pruefplaene/${pruefplan}.json`;
        const pruefplanInhalt = await fs.promises.readFile(filePath, 'utf-8');
        //console.log(pruefplanInhalt);
        globalPruefplan = pruefplan;
        
        //res.status(200).send('pruefplanInhalt');
        res.status(200).send(pruefplanInhalt);
    } catch (err) {
      console.error(err);
      res.status(500).send(err);
    }
});

/*
app.get('/pruefungen/speichern/:pruefplan', async (req, res) => {
    console.log("GET /pruefungen/speichern" + req.url);
    const pruefplan = req.params.pruefplan;
    const filePath = `pruefungen/speichern/${pruefplan}.json`;
    
    fs.readFile(filePath, 'utf-8', (err, data) => {
        if (err) {
        console.error(err);
        res.status(500).send(err);
        } else {
        console.log("GET /pruefungen/speichern/" + pruefplan);
        console.log("Pruefplan abgerufen:", data);
        res.status(200).send(data);
        }
    });
});
*/

app.get('/pruefungen/speichern/:pruefplan', async (req, res) => {
    console.log("GET /pruefungen/speichern" + req.url);
    const pruefplan = req.params.pruefplan;
    const filePath = `pruefungen/speichern/${pruefplan}.json`;
    globalPruefplan = pruefplan;
    
    fs.readFile(filePath, 'utf-8', (err, data) => {
        if (err) {
            console.error(err);
            res.status(500).send(err);
        } else {
            console.log("GET /pruefungen/speichern/" + pruefplan);
            console.log("Pruefplan abgerufen:", data);
            
            let jsonData = JSON.parse(data);

            //const decompressedData = decompress(data);
            //const jsonData = JSON.parse(decompressedData);

            //console.log("jsonData - bevor es rausgeht");
            //console.log(jsonData);

            // Funktion zum rekursiven Entfernen der gewünschten Schlüssel
            function removeKeys(obj) {
                for (const key in obj) {
                    //if (key === 'erfuellt' || key === 'anzahlSchritte' || key === 'erfuellteSchritte') {
                    if (key === 'anzahlSchritte' || key === 'erfuellteSchritte') {
                        delete obj[key];
                    } else if (typeof obj[key] === 'object') {
                        removeKeys(obj[key]);
                    }
                }
            }

            //removeKeys(jsonData);
            json(jsonData)
            tempJson = jsonData
            /* console.log("tempJson - bevor es rausgeht nach removeKeys");
            console.log(tempJson);

            console.log("json(tempJson) - bevor es rausgeht nach removeKeys");
            console.log(json(tempJson));
             */

            //res.status(200).json(jsonData);
            res.status(200).json(tempJson);
        }
    });
});
/*
app.post('/pruefungen/speichern/:pruefung', uploadStorage.single('file'), (req, res) => {
  var pruefung = req.params.pruefung;
  console.log("POST /pruefungen/speichern/");
  //console.log("Pruefplan speichern:", req.file.originalname);
  fs.writeFileSync("pruefungen/speichern/" + pruefung + ".json", JSON.stringify(req.body));
  res.status(200).send("Pruefplan erfolgreich gespeichert.");
});
*/

app.post('/pruefungen/speichern/', (req, res) => {
    var name = req.query.name;
    console.log("POST /pruefungen/speichern/##################################################");
    console.log("name zwischenspeichern");
    // const compressedData = compress(JSON.stringify(req.body));
    //console.log(name);
    //console.log("POST /pruefungen/speichern/");
    //console.log("Pruefplan speichern:", req.file.originalname);
    fs.writeFileSync(path.join(process.cwd(), "pruefungen", "speichern", name + ".json"), JSON.stringify(req.body));
    res.status(200).send("Pruefplan erfolgreich gespeichert.");
  });



app.post("/pruefungen/senden/", uploadStorage.single('pruefplan'), async (req, res) => {
  //var pruefung = req.;  
  const name = req.query.name;
  //const compressedData = compress(JSON.stringify(req.body));
  //console.log(name);
  //console.log(req)
  console.log("POST pruefungen/senden");

  // Pfad des zu löschenden JSON-Dokuments
  const deleteFilePath = path.join(process.cwd(), 'pruefungen', 'speichern', `${globalPruefplan}.json`);

  // Datei löschen, falls sie existiert
  if (fs.existsSync(deleteFilePath)) {
    try {
      fs.unlinkSync(deleteFilePath); // Synchrone Löschung
      console.log(`Datei gelöscht: ${deleteFilePath}`);
    } catch (error) {
      console.error(`Fehler beim Löschen der Datei ${deleteFilePath}:`, error);
      return res.status(500).send("Fehler beim Löschen der bestehenden Datei.");
    }
  }

  // Pfad des neuen Ordners erstellen
  const folderPath = path.join(process.cwd(), "pruefungen", "senden", name);
  ensurePruefungenDirectory(folderPath);

  // Ordner erstellen, falls er nicht existiert
  if (!fs.existsSync(folderPath)) {
  fs.mkdirSync(folderPath, { recursive: true });
  console.log(`Ordner erstellt: ${folderPath}`);
  }

  //fs.writeFileSync("pruefungen/senden/" + name + ".json", JSON.stringify(req.body));
  // Datei in den neu erstellten Ordner schreiben
  const filePath = path.join(folderPath, name + ".json");
  fs.writeFileSync(filePath, JSON.stringify(req.body));
  console.log(`Datei gespeichert: ${filePath}`);

  //createPDF(req.body, 'Pruefungsbericht.pdf');
  //console.log("Pruefplan hochgeladen:", req.file.originalname);
  // PDF erstellen und speichern, mit dynamischem Namen
  const pdfPath = path.join(process.cwd(), "pruefungen", "senden", name, `${name}.pdf`);
  createPDF(req.body, pdfPath, name);

  console.log(`PDF-Datei erstellt: ${pdfPath}`);
    
  res.status(200).send("Pruefplan erfolgreich hochgeladen.");
});

app.delete('/pruefungen/speichern/:pruefplan', (req, res) => {
    const pruefplan = req.params.pruefplan;
    const sendenPath = path.join(process.cwd(), 'pruefungen', 'senden', pruefplan + '.json');
    const speichernPath = path.join(process.cwd(), 'pruefungen', 'speichern', pruefplan + '.json');
    
    fs.unlink(speichernPath, (err) => {
      if (err) {
        console.error(err);
        res.status(500).send(err);
      } else {
        console.log(`DELETE /pruefungen/speichern/${pruefplan}`);
        res.status(200).send("Pruefplan erfolgreich gelöscht.");
      }
    });
  });

  // David branch Änderung 15.4.24
  app.post("/send", async (req, res) => {
    console.log("POST /send");
    var settings = JSON.parse(fs.readFileSync("Mail.json"));
    let transporter = nodemailer.createTransport(settings);
    var Adressen = null;
    var Ziele_erstellt = [];
    //console.log("msg: " + JSON.stringify(req.body));
    try {
        console.log("Modell: " + req.body.Modellidentifikation);
        var Ausgangsmodell = JSON.parse(fs.readFileSync("Modelle/" + req.body.Modellidentifikation));
        Adressen = Ausgangsmodell.VerantwortlicheAdressen;
        console.log("Adressen: " + JSON.stringify(Adressen));
    } catch {
    }    
    var Abteilungen = req.body.Abteilungen;
    console.log("Abteilungen '" + Abteilungen + "'");
    for (const Ziel2 of Abteilungen) {
        var z = Ziel2;
        
        if (!Adressen.hasOwnProperty(z)) continue;
        for (const element of Adressen[z])
        {
            if (!Ziele_erstellt.includes(element)) Ziele_erstellt.push(String(element));
        }
    }
    var Verantwortliche = req.body.AuswahlVerantwortliche;
    for (const Ziel2 of Verantwortliche) {
        var z = String(Ziel2);
        //console.log("Ziel2: " + z);
        if (!Adressen.hasOwnProperty(z)) continue;
        for (const element of Adressen[z])
        {
            if (!Ziele_erstellt.includes(element)) Ziele_erstellt.push(String(element));
        }
    }
    console.log("Ziele_erstellt: " + Ziele_erstellt);
    try {
        fs.mkdirSync('meldungen');
    } catch (error) {
        console.log(error);
    }

    var timestamp = Date.now();

    let file_content = {
      //Verantwortliche: req.body.Verantwortliche,
      Zeitstempel: timestamp,
      Abteilungen: req.body.Abteilungen,
      Montageplatz: req.body.Montageplatz, 
      Grund: req.body.Grund
    };

    var meldung = req.body.Montageplatz + "_" + timestamp + "_" + req.body.Grund;
    //meldung = meldung.replaceAll(':'|'\\'|'/'|'?'|'*'|'<'|'>'|'\"', "-");
    meldung = meldung.replaceAll(['\|/<>"*?'], "-");

    let msg_content = "";

    if (settings.Einleitungstext != undefined)
    {
        if (settings.Einleitungstext != "")
        {
            msg_content = settings.Einleitungstext + "\n\n";
        }
    }

    let message = {
        from: settings.from,
        subject: 'SAM-KI-Nachricht: Meldung ' + req.body.Grund + " an " + req.body.Montageplatz,
        attachments:  []
    };

    msg_content += "Montageplatz: " + JSON.stringify(req.body.Montageplatz) + "\n" +
      "Grund: " + JSON.stringify(req.body.Grund).replaceAll('[', '').replaceAll(']', '').replaceAll(',', ', ') + "\n";
    for (let i = 0; i < Object.keys(Ausgangsmodell.Anlagen).length; i++)
    {
        const titel = Object.keys(Ausgangsmodell.Anlagen)[i];

        if (req.body.Anlagen.hasOwnProperty(titel))
        {
            if (Ausgangsmodell.Anlagen[titel] == 'Text' || Ausgangsmodell.Anlagen[titel] == 'Code')
            {
                file_content[titel] = req.body.Anlagen[titel];
                msg_content += titel + ": " + JSON.stringify(req.body.Anlagen[titel]) + "\n";
            } else if (Ausgangsmodell.Anlagen[titel] == 'Foto') {
                try {
                    let foto = req.body.Anlagen[titel];
                    var ending = foto.split(";",1)[0].split("/")[1];
                    let base64Image = foto.split(';base64,').pop();
                    fs.writeFile('meldungen/' + meldung + "_" + titel + "." + ending, base64Image, {encoding: 'base64'}, function(err) {
                        console.log('Bild erstellt: ' + titel);
                    });
                    message.attachments = [...message.attachments, {
                        filename: meldung + "_" + titel + "." + ending,
                        path: foto
                    }];
                } catch (error) {
                    console.log(error);
                }
            }
        } else {
            if (Ausgangsmodell.Anlagen[titel] == 'Text' || Ausgangsmodell.Anlagen[titel] == 'Code')
            {
                file_content[titel] = ""
                msg_content += titel + ": \n";
            }
        }
    }

    if (settings.Hinweistext != undefined)
    {
      if (settings.Hinweistext != "")
      {
          msg_content += "\n\n" + settings.Hinweistext;
      }
    }

    msg_content = msg_content.replaceAll('"', '');

    message.text = msg_content;

    try {
        fs.writeFile("meldungen/" + meldung + ".json", JSON.stringify(file_content, null, "\t"), function(err) {
          console.log("Meldung erstellt: " + meldung);
        });
    } catch (error) {
        console.log(error);
      }    

      if (req.body.hasOwnProperty('Video'))
      {
          try {
              var ending = req.body.Video.split(";",1)[0].split("/")[1];
              let base64Video = base64String.split(';base64,').pop();
              fs.writeFile('meldungen/' + meldung + "." + ending, base64Video, {encoding: 'base64'}, function(err) {
                  console.log('Video erstellt');
              });
          } catch (error) {
              console.log(error);
          }
      }
  
      for (const Ziel of Ziele_erstellt)
      {
        console.log("Ziel: " + String(Ziel));     

        message.to = Ziel;  

        transporter.sendMail(message, (err, info) => {
            if (err) {
                console.log('Fehler beim Mailsenden: ' + err.message);
                //res.status(500).send(err.message);
              } else {
                console.log('Mail versendet: %s', info.messageId);   
              }
            });
        }   

        res.status(200).send('OK');
      });     

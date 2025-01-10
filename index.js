#!/usr/bin / env node

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
const PDFDocument = require('pdfkit');
const { Console } = require('console');
const { json } = require('body-parser');
require( 'console-stamp' )( console );

const multer = require('multer');

let globalPruefplan = null; // Globale Variable

// Konfiguration für das Speichern der hochgeladenen Datei
const storage = multer.diskStorage({
  destination: (req, file, cb) => {

    cb(null, '/pruefungen/speichern/');
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

//Function
function createJsonFromFilenames(searchDirectory, saveDirectory) {
    const directory = path.join(process.cwd(), searchDirectory);

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
        fs.writeFile(path.join(saveDirectory, 'result.json'), JSON.stringify(result, null, 2), (err) => {
            if (err) {
                console.error("Fehler beim Schreiben der JSON-Datei: ", err);
            } else {
                console.log("Die JSON-Datei wurde erfolgreich geschrieben!");
            }
        });
    });
}

function createPDF(data, outputFilePath, name) {
    // Dokument im Querformat erstellen
    console.log("STart");
    const doc = new PDFDocument({ layout: 'landscape', margin: 10 });
    const stream = fs.createWriteStream(outputFilePath);

    doc.pipe(stream);

    // Titel des PDFs
    doc.fontSize(16).text(name, { align: 'center' }).moveDown(1);

    // JSON-Inhalte iterieren
    for (const section in data) {
        const items = data[section];

        doc.fontSize(10).text(section, 40, doc.y + 20, { underline: true }).moveDown(0.5);


        // Tabellenüberschriften und Zeilen vorbereiten
        let headers;
        const rows = [];

        if (section === "Eingangsinformationen") {
            headers = ['Beschreibung'];
            for (const key in items) {
                const item = items[key];
                if (typeof item === 'object') {
                    const row = [
                        key,
                        item.Beschreibung || '',

                    ];

                    // Wenn ein Bild vorhanden ist, füge Base64-String in die "Daten"-Spalte ein
                    if (item.Typ === 'Foto' && item.value && item.value.startsWith('data:image')) {
                        row.push(item.value); // Base64-String
                    } else {
                        row.push(''); // Keine Daten
                    }

                    rows.push(row);
                }
            }
        } else {
            // Standardspalten für alle anderen Sektionen
            headers = ['', 'Beschreibung', 'Benötigt', 'Erfüllt', 'Kommentar', 'Daten'];
            for (const key in items) {
                const item = items[key];
                if (typeof item === 'object') {
                    const row = [
                        key,
                        item.Beschreibung || '',
                        item.Benötigt !== undefined ? item.Benötigt.toString() : '',
                        item.erfuellt !== undefined ? item.erfuellt.toString() : '',
                        item.Kommentar !== undefined ? item.Kommentar.toString() : '-'
                    ];

                    // Wenn ein Bild vorhanden ist, füge Base64-String in die "Daten"-Spalte ein
                    if (item.Typ === 'Foto' && item.value && item.value.startsWith('data:image')) {
                        row.push(item.value); // Base64-String
                    } else {
                        row.push('-'); // Keine Daten
                    }

                    rows.push(row);
                }
            }
        }

        // Tabelle zeichnen
        doc.moveDown();
        createTable(doc, headers, rows, 50, doc.y);

        // Neue Seite, wenn Platz knapp wird
        if (doc.y > 500) {
            doc.addPage({ layout: 'landscape' });
        }
    }

    // Dokument abschließen
    doc.end();

    stream.on('finish', () => {
        console.log(`PDF wurde erstellt: ${outputFilePath}`);
    });
}

// Funktion zum Zeichnen der Tabelle
function createTable(doc, headers, rows, startX, startY) {
    let y = startY;

    // Tabellenüberschriften
    if (headers.length > 1) { // Nur ausgeben, wenn es Spaltenüberschriften gibt
        doc.fontSize(8).font('Helvetica-Bold');
        headers.forEach((header, i) => {
            doc.text(header, startX + i * 120, y, { width: 100, align: 'left' });
        });
        y += 20;
    }

    // Tabellenzeilen
    doc.fontSize(6).font('Helvetica');
    rows.forEach(row => {
        row.forEach((cell, i) => {
            if (i === 5 && cell.startsWith('data:image')) {
                // Wenn der Wert in der Spalte "Daten" ein Bild ist
                const base64Data = cell.split(';base64,').pop();
                const buffer = Buffer.from(base64Data, 'base64');

                const uniqueId = Date.now() + "_" + Math.random().toString(36).substring(2, 15);
                const imagePath = `./temp_${uniqueId}.png`;
                fs.writeFileSync(imagePath, buffer);

                // Bild in die "Daten"-Spalte einfügen (Größe anpassen)
                doc.image(imagePath, startX + i * 120, y, { width: 90, height: 70 });
                fs.unlinkSync(imagePath); // Temporäre Datei löschen
                y += 90;
            } else {
                // Normaler Text in der Zelle anzeigen
                if (cell === 'true') {
                    doc.fillColor('green');
                } else if (cell === 'false') {
                    doc.fillColor('red');
                } else {
                    doc.fillColor('black');
                }
                doc.text(cell, startX + i * 120, y, { width: 100, align: 'left' });
            }
        });
        y += 15;

        // Neue Seite für Tabellen, wenn Platz knapp wird
        if (y > 500) {
            doc.addPage({ layout: 'landscape' });
            y = 50; // Neue Position auf der neuen Seite
        }
    });
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
        fs.writeFileSync('Pruefplaeneverzeichnis_Test_.json', JSON.stringify(existingJson, null, 2));
        console.log('Die aktualisierte JSON wurde in "Pruefplaeneverzeichnis_Test_.json" geschrieben.');

    } catch (error) {
        console.error('Fehler beim Einlesen der JSON-Dateien:', error);
    }
}

// Beispiel zum Einlesen der bestehenden JSON-Datei
const existingJsonFilePath = 'Pruefplaeneverzeichnis_Test_.json'; // Pfad zur JSON-Datei

let existingJson = {};
try {
    existingJson = JSON.parse(fs.readFileSync(existingJsonFilePath, 'utf-8'));
} catch (error) {
    console.error('Fehler beim Einlesen der bestehenden JSON-Datei:', error);
}


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

app.use(cors());
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
        const zg_pruefplaene = JSON.parse(fs.readFileSync('result.json', 'utf-8'));
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
    //console.log(name);
    //console.log("POST /pruefungen/speichern/");
    //console.log("Pruefplan speichern:", req.file.originalname);
    fs.writeFileSync("pruefungen/speichern/" + name + ".json", JSON.stringify(req.body));
    res.status(200).send("Pruefplan erfolgreich gespeichert.");
  });



app.post("/pruefungen/senden", uploadStorage.single('pruefplan'), async (req, res) => {
  //var pruefung = req.;  
  var name = req.query.name;
  //console.log(name);
  //console.log(req)
  console.log("POST pruefungen/senden");

  // Pfad des zu löschenden JSON-Dokuments
  const deleteFilePath = path.join("pruefungen/speichern/", `${globalPruefplan}.json`);

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
  const folderPath = path.join("pruefungen/senden", name);

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
  const pdfPath = path.join(folderPath, `${name}.pdf`);
  createPDF(req.body, pdfPath, name);
  console.log(`PDF-Datei erstellt: ${pdfPath}`);
    
  res.status(200).send("Pruefplan erfolgreich hochgeladen.");
});

app.delete('/pruefungen/speichern/:pruefplan', (req, res) => {
    const pruefplan = req.params.pruefplan;
    const sendenPath = path.join(__dirname, 'pruefungen', 'senden', pruefplan + '.json');
    const speichernPath = path.join(__dirname, 'pruefungen', 'speichern', pruefplan + '.json');
    
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
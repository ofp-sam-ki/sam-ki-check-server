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
const { Console } = require('console');
const { json } = require('body-parser');
require( 'console-stamp' )( console );

const multer = require('multer');

// Konfiguration für das Speichern der hochgeladenen Datei/* 
/* const storage = multer.diskStorage({dest: 'pruefungen/'}); */

function fileFilter (req, file, cb)
{

  // The function should call `cb` with a boolean
  // to indicate if the file should be accepted

  // To reject this file pass `false`, like so:
  if (file.mimetype == 'application/json' || file.mimetype == 'application/zip') {
    cb(null, true);
    return;
  }
  
  cb(null, false)

  // To accept the file pass `true`, like so:
  

  // You can always pass an error if somsething goes wrong:
  cb(new Error('I don\'t have a clue!'))

}

const storage = multer.diskStorage({
  destination: 'pruefungen/',
  filename: function (req, file, cb) {
    cb(null, file.originalname)
  }
});

//const upload = multer({ storage });
const uploadStorage = multer({ storage: storage, fileFilter: fileFilter });

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

app.use(cors());
app.use(bodyParser.urlencoded({limit: '100mb', extended: true}));
app.use(bodyParser.json({limit: '100mb'}));
const port = process.env.PORT || 4000;
app.listen(port, () => {
    console.log('Server für SAM-KI-Check');
    console.log("(c)2024 David Breunig, Fraunhofer IPA");
    console.log("Beta v0.1.4");
    console.log(`Host-Id: ${hostid}`);
    console.log(`Listener auf ${port}`);
    console.log('PORT als Umgebungsvariable für anderen Port');
});


app.get('/Pruefplaeneverzeichnis', async (req, res) => {
    console.log("GET Pruefplaeneverzeichnis.json" + req.url);
    try {
        const pruefplaene = JSON.parse(fs.readFileSync('Pruefplaeneverzeichnis.json', 'utf-8'));
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

app.get('/pruefplaene/:pruefplan', async (req, res) => {
    console.log("GET /pruefplaene");
    try {
        const pruefplan = req.params.pruefplan;
            const filePath = `pruefplaene/${pruefplan}.json`;
        const pruefplanInhalt = await fs.promises.readFile(filePath, 'utf-8');
        console.log(pruefplanInhalt);
        //res.status(200).send('pruefplanInhalt');
        res.status(200).send(pruefplanInhalt);
    } catch (err) {
      console.error(err);
      res.status(500).send(err);
    }
});

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

app.post('/pruefungen/speichern/:pruefung', uploadStorage.single('file'), (req, res) => {
  var pruefung = req.params.pruefung;
  console.log("POST /pruefungen/speichern/");
  //console.log("Pruefplan speichern:", req.file.originalname);
  fs.writeFileSync("pruefungen/speichern/" + pruefung + ".json", JSON.stringify(req.body));
  res.status(200).send("Pruefplan erfolgreich gespeichert.");
});

app.post("/pruefungen/senden", uploadStorage.single('pruefplan'), async (req, res) => {
    console.log("POST pruefungen/senden");
    console.log("Pruefplan hochgeladen:", req.file.originalname);
    
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

app.post('/pruefungen/zwischenspeichern', uploadStorage.fields([{name: 'pruefung', maxCount: 1}, {name: 'daten', maxCount: 1}]), (req, res) => {
  /* req.files */
  /* var pruefung = req.params.pruefung;
  console.log("POST /pruefungen/speichern/");
  //console.log("Pruefplan speichern:", req.file.originalname);
  fs.writeFileSync("pruefungen/speichern/" + pruefung + ".json", JSON.stringify(req.body)); */
  res.status(200).send("Pruefplan erfolgreich gespeichert.");

  //mindestens "pruefung" muss vorhanden sein, sonst verwerfen --> löschen und 500 o.ä. rückmelden
  //"pruefung" muss mindestfelder definiert haben: prüfplan, produkt, erstellort, zeitstempel --> sonst löschen und 500 o.Ä. rückmelden
  //"pruefung" und "daten" (falls vorhanden) müssen mit einer kombination aus prüfplan (erstellort?) und zeitstempel im dateinamen erweitert werden

  if (!fs.existsSync("pruefungen")) {
    fs.mkdirSync("pruefungen/zwischengespeichert", { recursive: true });
  }

  fs.rename("pruefungen/" + pruefung, "pruefungen/zwischengespeichert/" + pruefung);

  fs.rename("pruefungen/" + daten, "pruefungen/zwischengespeichert/daten_" + pruefung);
});

app.get('/pruefungen/liste', (req, res) => {
  const pruefungen = [];

  try {
    const dateien = fs.readdirSync("pruefungen/zwischengespeichert");

    for (const datei of dateien) {
      const endung = path.extname(datei);

      if (endung === `.json`) {
        pruefungen.push(path.basename(datei, endung));
      }
    }

    res.status(200).json(pruefungen);
  } catch (err) {
    console.error(err);
    res.status(500).send(err);
  }
});

app.get('/pruefungen/:pruefung', (req, res) => {
  try {
    res.sendFile('/pruefung/' + req.params.pruefung + ".json");
  } catch (err) {
    console.error(err);
    res.status(404).send(err);
  }
});

app.get('/pruefungen_daten/:pruefung', (req, res) => {
  try {
    res.sendFile('/pruefung/' + req.params.pruefung + "_daten.zip");
  } catch (err) {
    console.error(err);
    res.status(404).send(err);
  }
});
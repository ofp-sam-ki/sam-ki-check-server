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

// Konfiguration für das Speichern der hochgeladenen Datei
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // wie komme ich hier entweder zum Ordner senden, oder zum Ordner speichern?
    //cb(null, 'pruefungen/');
    cb(null, '/pruefungen/speichern/');
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

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


app.get('/Pruefplaeneverzeichnis_Test', async (req, res) => {
    console.log("GET Pruefplaeneverzeichnis_Test.json" + req.url);
    try {
        const pruefplaene = JSON.parse(fs.readFileSync('Pruefplaeneverzeichnis_Test.json', 'utf-8'));
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

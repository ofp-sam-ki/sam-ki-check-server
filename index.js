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

//Function
function createJsonFromFilenames(relativeDirectory) {
    const directory = path.join(process.cwd(), relativeDirectory);

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
        fs.writeFile(path.join(directory, 'result.json'), JSON.stringify(result, null, 2), (err) => {
            if (err) {
                console.error("Fehler beim Schreiben der JSON-Datei: ", err);
            } else {
                console.log("Die JSON-Datei wurde erfolgreich geschrieben!");
            }
        });
    });
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

app.use(cors());
app.use(bodyParser.urlencoded({limit: '100mb', extended: true}));
app.use(bodyParser.json({limit: '100mb'}));
const port = process.env.PORT || 4000;
app.listen(port, () => {
    console.log('Server für SAM-KI-Check');
    console.log("(c)2023, 2024 David Breunig, Fraunhofer IPA");
    console.log("Beta v0.1.5");
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
// Create Zwischenspeicher Verzeichnis
app.get('/createZwischenspeicherverzeichnis_List', async (req, res) => {
    console.log("Create Zwischenspeicherverzeichnis result.json" + req.url);
    try {
        createJsonFromFilenames('pruefungen/speichern');
    } catch (err) {
        console.error(err);
        res.status(500).send(err);
    }
    
});
// Get Zwischenspeicher Verzeichnis
app.get('/Zwischenspeicherverzeichnis_List', async (req, res) => {
    console.log("GET Zwischenspeicherverzeichnis_Test.json" + req.url);

    try {
        const zg_pruefplaene = JSON.parse(fs.readFileSync('pruefungen/speichern/result.json', 'utf-8'));
        res.status(200).json(zg_pruefplaene);
        console.log("send zg_List")
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
  //var pruefung = req.;  
  var name = req.query.name;
  console.log(name);
  //console.log(req)
  console.log("POST pruefungen/senden");
  fs.writeFileSync("pruefungen/senden/" + name + ".json", JSON.stringify(req.body));
  //console.log("Pruefplan hochgeladen:", req.file.originalname);
    
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
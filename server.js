const express = require("express");
const axios   = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const EXOTEL_SID     = process.env.EXOTEL_SID     || "dell627";
const EXOTEL_API_KEY = process.env.EXOTEL_API_KEY  || "56621990fb88379141220ea59b250a76fe1dd369228b867c";
const EXOTEL_TOKEN   = process.env.EXOTEL_TOKEN    || "82189a2fff0f2642e888cf4ed58e9d1ef800960021f4e42e";
const EXOTEL_FROM    = process.env.EXOTEL_FROM     || "09413886363";
const GEMINI_KEY     = process.env.GEMINI_API_KEY  || "";
const BASE_URL       = process.env.BASE_URL        || "https://healio-ivr-backend.onrender.com";

const EXOTEL_BASE = "https://" + EXOTEL_API_KEY + ":" + EXOTEL_TOKEN + "@api.exotel.com/v1/Accounts/" + EXOTEL_SID;

const HOSPITALS = [
  { name: "Tambaram Govt. Hospital",  address: "Tambaram, Chennai 600045",        distance: "1.1 km", phone: "04422263500" },
  { name: "Govt. Stanley Hospital",   address: "Old Jail Rd, Park Town, Chennai", distance: "3.2 km", phone: "04425281201" },
  { name: "RGGGH Chennai",            address: "Park Town, Chennai 600003",       distance: "4.8 km", phone: "04425305000" },
  { name: "Apollo Hospital Chennai",  address: "Greams Road, Chennai 600006",     distance: "8.5 km", phone: "04428290200" },
  { name: "Fortis Malar Hospital",    address: "Gandhi Nagar, Adyar, Chennai",    distance: "10 km",  phone: "04424741414" }
];

const REMEDIES = {
  headache: ["Rest in a quiet dark room.", "Apply a cold compress on your forehead.", "Drink at least 8 glasses of water.", "Massage your temples gently.", "Avoid bright screens for 30 minutes."],
  back:     ["Apply a warm heat pad for 15 minutes.", "Try gentle stretching exercises.", "Avoid sitting for long periods.", "Sleep on your side with a pillow between your knees.", "Avoid heavy lifting until pain subsides."],
  stomach:  ["Sip warm ginger tea slowly.", "Try the BRAT diet: Banana, Rice, Applesauce, Toast.", "Avoid spicy and oily foods.", "Stay hydrated with clear fluids.", "Rest and avoid strenuous activity."],
  chest:    ["Sit upright and breathe slowly.", "Loosen tight clothing around your chest.", "Drink warm water or herbal tea.", "Avoid strenuous activity.", "If pain radiates to your arm, call 108 immediately."],
  fever:    ["Rest and drink plenty of fluids.", "Apply a cool damp cloth on your forehead.", "Take paracetamol if above 38 degrees.", "Wear light clothing.", "See a doctor if fever lasts more than 3 days."],
  throat:   ["Gargle with warm salt water 3 times a day.", "Drink warm honey and ginger tea.", "Suck on lozenges or hard candy.", "Avoid cold drinks and ice cream.", "Rest your voice and avoid shouting."],
  cold:     ["Drink warm fluids like soup and tea.", "Try steam inhalation with a towel.", "Rest adequately for at least 8 hours.", "Use a saline nasal spray.", "Avoid cold weather and air conditioning."],
  default:  ["Rest adequately and avoid overexertion.", "Stay well hydrated with water and herbal teas.", "Apply a warm or cold compress to the affected area.", "Eat light nutritious meals.", "Consult a doctor if symptoms persist beyond 3 days."]
};

function detectSymptom(text) {
  var t = (text || "").toLowerCase();
  if (/head|migraine|skull|temple/.test(t))         return "headache";
  if (/back|spine|lumbar|shoulder|waist/.test(t))   return "back";
  if (/stomach|abdomen|belly|nausea|vomit/.test(t)) return "stomach";
  if (/chest|heart|breath|lung/.test(t))            return "chest";
  if (/fever|temperature|hot|chills/.test(t))       return "fever";
  if (/throat|tonsil|swallow|hoarse/.test(t))       return "throat";
  if (/cold|cough|sneeze|runny/.test(t))            return "cold";
  return "default";
}

function exoml(body) {
  return '<?xml version="1.0" encoding="UTF-8"?><Response>' + body + '</Response>';
}

function say(text) {
  return '<Say language="en-IN" voice="female">' + text + '</Say>';
}

function gather(action, digits, body) {
  return '<Gather action="' + action + '" numDigits="' + digits + '" timeout="8">' + body + '</Gather>';
}

function record(action, maxLen) {
  return '<Record action="' + action + '" maxLength="' + maxLen + '" playBeep="true" transcribe="true"/>';
}

function redirect(url) {
  return '<Redirect>' + url + '</Redirect>';
}

// Health check
app.get("/", function(req, res) {
  res.json({ status: "Healio IVR Backend running", version: "1.0.0" });
});

// 1. WELCOME
app.all("/ivr/welcome", function(req, res) {
  res.set("Content-Type", "text/xml");
  res.send(exoml(
    say("Welcome to Healio, your smart medical assistant.") +
    say("Please listen carefully and press the key for your choice.") +
    gather(BASE_URL + "/ivr/menu", 1,
      say("Press 1 for Emergency and Ambulance.") +
      say("Press 2 to Book a Doctor Appointment.") +
      say("Press 3 to Describe your Symptoms and get remedies.") +
      say("Press 4 to find the Nearest Hospital.") +
      say("Press 9 to hear this menu again.")
    ) +
    say("We did not receive your input. Please call again. Goodbye.")
  ));
});

// 2. MENU ROUTER
app.all("/ivr/menu", function(req, res) {
  var digit = req.body.digits || req.query.digits || "9";
  res.set("Content-Type", "text/xml");
  var routes = { "1": "/ivr/emergency", "2": "/ivr/appointment", "3": "/ivr/symptoms", "4": "/ivr/hospital" };
  var target = routes[digit] || "/ivr/welcome";
  res.send(exoml(redirect(BASE_URL + target)));
});

// 3. EMERGENCY
app.all("/ivr/emergency", function(req, res) {
  var nearest = HOSPITALS[0];
  res.set("Content-Type", "text/xml");
  res.send(exoml(
    say("Emergency detected. Do not panic. Help is available right now.") +
    say("The nearest hospital is " + nearest.name + ", located at " + nearest.address + ", which is " + nearest.distance + " away.") +
    say("You can also call 1 0 8 for a free ambulance anywhere in India.") +
    gather(BASE_URL + "/ivr/emergency-action", 1,
      say("Press 1 to call the nearest hospital right now.") +
      say("Press 2 to hear instructions for calling 108.") +
      say("Press 9 to go back to the main menu.")
    )
  ));
});

app.all("/ivr/emergency-action", function(req, res) {
  var digit   = req.body.digits || req.query.digits || "9";
  var nearest = HOSPITALS[0];
  res.set("Content-Type", "text/xml");

  if (digit === "1") {
    var params = new URLSearchParams();
    params.append("From",     EXOTEL_FROM);
    params.append("To",       nearest.phone);
    params.append("CallerId", EXOTEL_FROM);
    params.append("StatusCallback", BASE_URL + "/ivr/call-status");
    axios.post(EXOTEL_BASE + "/Calls/connect.json", params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    }).catch(function(e) { console.error("Emergency call error:", e.message); });

    res.send(exoml(
      say("Connecting you to " + nearest.name + " now. Please stay on the line.") +
      say("If the call does not connect, please dial 1 0 8 for a free ambulance.")
    ));
  } else if (digit === "2") {
    res.send(exoml(
      say("To call a free ambulance, hang up this call and dial 1 0 8 from your phone.") +
      say("1 0 8 is available 24 hours, 7 days a week, across all of India.") +
      say("Please call now. Goodbye and stay safe.")
    ));
  } else {
    res.send(exoml(redirect(BASE_URL + "/ivr/welcome")));
  }
});

// 4. APPOINTMENT
app.all("/ivr/appointment", function(req, res) {
  res.set("Content-Type", "text/xml");
  res.send(exoml(
    say("Here are the nearest hospitals. Press the number to book an appointment.") +
    gather(BASE_URL + "/ivr/appointment-book", 1,
      say("Press 1 for " + HOSPITALS[0].name + ", " + HOSPITALS[0].distance + " away.") +
      say("Press 2 for " + HOSPITALS[1].name + ", " + HOSPITALS[1].distance + " away.") +
      say("Press 3 for " + HOSPITALS[2].name + ", " + HOSPITALS[2].distance + " away.") +
      say("Press 9 to go back to the main menu.")
    )
  ));
});

app.all("/ivr/appointment-book", function(req, res) {
  var digit  = req.body.digits || req.query.digits || "9";
  var caller = req.body.From   || req.query.From   || "Unknown";
  res.set("Content-Type", "text/xml");

  var index = parseInt(digit) - 1;
  if (index >= 0 && index <= 2) {
    var hospital = HOSPITALS[index];
    var smsParams = new URLSearchParams();
    smsParams.append("From", EXOTEL_FROM);
    smsParams.append("To",   hospital.phone);
    smsParams.append("Body", "Healio Appointment Request: A patient is requesting an appointment at " + hospital.name + ". Patient contact: " + caller + ". Please call them back to confirm. - Healio AI Assistant");
    axios.post(EXOTEL_BASE + "/Sms/send.json", smsParams, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    }).catch(function(e) { console.error("SMS error:", e.message); });

    res.send(exoml(
      say("Your appointment request has been sent to " + hospital.name + ".") +
      say("Their address is " + hospital.address + ".") +
      say("They will contact you soon to confirm your appointment.") +
      say("Thank you for using Healio. Stay healthy. Goodbye.")
    ));
  } else {
    res.send(exoml(redirect(BASE_URL + "/ivr/welcome")));
  }
});

// 5. SYMPTOMS
app.all("/ivr/symptoms", function(req, res) {
  res.set("Content-Type", "text/xml");
  res.send(exoml(
    say("Please describe your symptoms clearly after the beep.") +
    say("For example, you can say: I have a headache. Or: I have stomach pain.") +
    say("You have 10 seconds to speak.") +
    record(BASE_URL + "/ivr/symptoms-process", 10)
  ));
});

app.all("/ivr/symptoms-process", function(req, res) {
  var transcribed = req.body.TranscriptionText || req.query.TranscriptionText || "";
  res.set("Content-Type", "text/xml");

  if (transcribed && transcribed.trim().length > 2 && GEMINI_KEY) {
    var genAI = new GoogleGenerativeAI(GEMINI_KEY);
    var model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    var promptText = "You are Healio, a voice medical assistant on a phone call. The patient said: " + transcribed + ". Give exactly 5 short home remedy steps. Each step must be one short sentence under 15 words. No bullet points or numbers. Just plain sentences separated by periods. End with: Please consult a doctor if your symptoms persist beyond 3 days.";

    model.generateContent(promptText).then(function(result) {
      var remedyText = result.response.text();
      res.send(exoml(
        say("Thank you. Here are your home remedies.") +
        say(remedyText) +
        say("I hope you feel better very soon. Take good care of yourself.") +
        gather(BASE_URL + "/ivr/symptoms-repeat", 1,
          say("Press 1 to hear the remedies again.") +
          say("Press 2 to go back to the main menu.")
        )
      ));
    }).catch(function(e) {
      console.error("Gemini error:", e.message);
      var symptom    = detectSymptom(transcribed);
      var remedyText = REMEDIES[symptom].join(" ");
      res.send(exoml(
        say("Thank you. Here are your home remedies.") +
        say(remedyText) +
        say("I hope you feel better very soon.") +
        gather(BASE_URL + "/ivr/symptoms-repeat", 1,
          say("Press 1 to hear again. Press 2 for main menu.")
        )
      ));
    });
  } else {
    var symptom    = detectSymptom(transcribed);
    var remedyText = REMEDIES[symptom].join(" ");
    res.send(exoml(
      say("Thank you. Here are your home remedies.") +
      say(remedyText) +
      say("I hope you feel better very soon. Take good care of yourself.") +
      gather(BASE_URL + "/ivr/symptoms-repeat", 1,
        say("Press 1 to hear the remedies again.") +
        say("Press 2 to go back to the main menu.")
      )
    ));
  }
});

app.all("/ivr/symptoms-repeat", function(req, res) {
  var digit = req.body.digits || req.query.digits || "2";
  res.set("Content-Type", "text/xml");
  if (digit === "1") {
    res.send(exoml(redirect(BASE_URL + "/ivr/symptoms")));
  } else {
    res.send(exoml(redirect(BASE_URL + "/ivr/welcome")));
  }
});

// 6. NEAREST HOSPITAL
app.all("/ivr/hospital", function(req, res) {
  var nearest = HOSPITALS[0];
  res.set("Content-Type", "text/xml");
  res.send(exoml(
    say("The nearest hospital to you is " + nearest.name + ".") +
    say("It is located at " + nearest.address + ".") +
    say("It is approximately " + nearest.distance + " away from your location.") +
    say("Their phone number is " + nearest.phone.split("").join(" ") + ".") +
    gather(BASE_URL + "/ivr/hospital-action", 1,
      say("Press 1 to call this hospital now.") +
      say("Press 2 to hear the next nearest hospital.") +
      say("Press 9 to go back to the main menu.")
    )
  ));
});

app.all("/ivr/hospital-action", function(req, res) {
  var digit = req.body.digits || req.query.digits || "9";
  res.set("Content-Type", "text/xml");

  if (digit === "1") {
    var callParams = new URLSearchParams();
    callParams.append("From",     EXOTEL_FROM);
    callParams.append("To",       HOSPITALS[0].phone);
    callParams.append("CallerId", EXOTEL_FROM);
    axios.post(EXOTEL_BASE + "/Calls/connect.json", callParams, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    }).catch(function(e) { console.error("Hospital call error:", e.message); });

    res.send(exoml(say("Connecting you to " + HOSPITALS[0].name + ". Please hold the line.")));
  } else if (digit === "2") {
    var second = HOSPITALS[1];
    res.send(exoml(
      say("The second nearest hospital is " + second.name + ".") +
      say("Located at " + second.address + ", " + second.distance + " away.") +
      say("Phone number: " + second.phone.split("").join(" ") + ".") +
      redirect(BASE_URL + "/ivr/welcome")
    ));
  } else {
    res.send(exoml(redirect(BASE_URL + "/ivr/welcome")));
  }
});

// 7. CALL STATUS
app.all("/ivr/call-status", function(req, res) {
  console.log("Call status:", req.body);
  res.status(200).send("OK");
});

app.listen(PORT, function() {
  console.log("Healio IVR Backend running on port " + PORT);
});

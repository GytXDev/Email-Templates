import dotenv from "dotenv";
import { Resend } from "resend";
import { readFileSync } from "fs";
import { join } from "path";

// Charger les variables d'environnement depuis le fichier .env
dotenv.config();

// Utilisation de la variable d'environnement pour sécuriser la clé API
if (!process.env.RESEND_API_KEY) {
  throw new Error(
    "RESEND_API_KEY n'est pas définie dans les variables d'environnement",
  );
}

const resend = new Resend(process.env.RESEND_API_KEY);

function generateEmailHtml() {
  try {
    const templatePath = join(
      __dirname,
      "email-templates/response-keva-initiative.html",
    );
    const htmlContent = readFileSync(templatePath, "utf-8");

    // Remplacer la variable de date dynamique
    return htmlContent.replace(
      "${new Date().getFullYear()}",
      new Date().getFullYear().toString(),
    );
  } catch (error) {
    console.error("Erreur lors de la lecture du template HTML:", error);
    return "<p>Erreur lors du chargement du template</p>";
  }
}

async function sendEmail() {
  const html = generateEmailHtml();
  try {
    const data = await resend.emails.send({
      from: "Agence Digitale GytX <messages@mail.gytx.dev>",
      to: ["antoineminko@gmail.com"],
      cc: [
        "mahelnguindja@gmail.com",
      ],
      subject: "Réponse - Refonte Site KEVA INITIATIVE",
      html,
    });
    console.log("Email envoyé avec succès :", data);
  } catch (error: any) {
    console.error(
      "Erreur lors de l.'envoi de l'email :",
      error?.message || error,
    );
  }
}

sendEmail();

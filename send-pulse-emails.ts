import dotenv from "dotenv";
import { Resend } from "resend";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// Charger les variables d'environnement depuis le fichier .env
dotenv.config();

// Configuration de Resend
if (!process.env.RESEND_API_KEY) {
  console.error(
    "ERREUR : RESEND_API_KEY n'est pas définie dans le fichier .env",
  );
  process.exit(1);
}

const resend = new Resend(process.env.RESEND_API_KEY);

interface Contact {
  companyName: string;
  email: string;
}

/**
 * Lit le fichier contact.txt et extrait les entreprises et leurs emails.
 * Format attendu : Nom Entreprise → email@domaine.com
 */
function parseContacts(): Contact[] {
  const contactFilePath = join(__dirname, "contact.txt");

  if (!existsSync(contactFilePath)) {
    console.error(`ERREUR : Le fichier ${contactFilePath} est introuvable.`);
    return [];
  }

  const content = readFileSync(contactFilePath, "utf-8");
  const lines = content.split("\n");
  const contacts: Contact[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // Format: "ADN ENGINEERING → contacts@adneng.com"
    if (trimmedLine.includes("→")) {
      const [name, email] = trimmedLine.split("→").map((s) => s.trim());
      if (name && email) {
        contacts.push({ companyName: name, email: email });
      }
    }
  }

  return contacts;
}

/**
 * Génère le contenu HTML personnalisé pour une entreprise.
 */
function generatePersonalizedHtml(companyName: string): string {
  try {
    const templatePath = join(
      __dirname,
      "email-templates/pulse-module-odoo.html",
    );
    let htmlContent = readFileSync(templatePath, "utf-8");

    // Remplacement des variables du template
    return htmlContent.replace(/{{companyName}}/g, companyName);
  } catch (error) {
    console.error("Erreur lors de la lecture du template HTML:", error);
    return "";
  }
}

/**
 * Envoie les emails de façon personnalisée à chaque contact.
 */
async function sendPulseEmails() {
  const contacts = parseContacts();
  console.log(`Préparation de l'envoi de ${contacts.length} emails...`);

  if (contacts.length === 0) {
    console.log("Aucun contact valide trouvé dans contact.txt");
    return;
  }

  const results = [];

  for (const contact of contacts) {
    try {
      const html = generatePersonalizedHtml(contact.companyName);

      console.log(`Envoi à : ${contact.companyName} (${contact.email})...`);

      const data = await resend.emails.send({
        from: "L'équipe GytX <support@mail.gytx.dev>",
        to: [contact.email],
        replyTo: "support@gytx.dev",
        subject: "Solution de suivi des devis et factures",
        html: html,
      });

      console.log(`Succès pour ${contact.companyName}`);
      results.push({
        name: contact.companyName,
        success: true,
        id: data.data?.id,
      });

      // Petit délai de 500ms pour éviter tout souci de rate limiting (bien que Resend soit robuste)
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error: any) {
      console.error(
        `Échec pour ${contact.companyName} :`,
        error?.message || error,
      );
      results.push({
        name: contact.companyName,
        success: false,
        error: error?.message,
      });
    }
  }

  console.log("\n--- Rapport final ---");
  console.table(results);
  console.log("L'opération est terminée.");
}

// Lancement du script
sendPulseEmails();

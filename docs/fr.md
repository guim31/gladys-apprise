# Apprise

Envoyez les messages de Gladys vers Discord, Telegram, Matrix, Slack, ntfy,
Pushover, l'e-mail, les SMS et plus de 100 autres services via votre propre
[API Apprise](https://github.com/caronc/apprise-api) : les messages de vos
scènes, les réponses de Gladys et ses messages système, ainsi que des
notifications avec titre et type depuis vos scènes. Gladys parle à l'API
Apprise sur votre réseau local ; Apprise joint ensuite chaque service.

> Testée contre une vraie API Apprise 2.0.1 (image `caronc/apprise`), avec
> configurations enregistrées, tags et pièces jointes, mais pas dans une vraie
> installation de Gladys. Si quelque chose ne marche pas comme décrit,
> dites-le sur le [forum Gladys](https://community.gladysassistant.com) ou
> dans les [issues](https://github.com/guim31/gladys-apprise/issues).

## Ce qu'il vous faut

- Gladys Assistant 5.1.0 ou plus récent.
- Une **API Apprise** que Gladys peut joindre sur votre réseau, par exemple
  l'image Docker `caronc/apprise` (port 8000).
- Les services à prévenir, écrits sous forme d'**URL Apprise** :
  `tgram://jeton_du_bot/chat_id` pour Telegram,
  `discord://webhook_id/webhook_token`, `mailto://utilisateur:motdepasse@gmail.com`,
  `ntfy://sujet`… La liste des services et la syntaxe de leurs URL sont sur
  [appriseit.com](https://appriseit.com/services/).

Deux façons de dire à Gladys où envoyer :

1. **Une configuration enregistrée (conseillé)** : dans la page web de l'API
   Apprise, créez une configuration sous une clé (par exemple `apprise`) et
   donnez à chaque URL un ou plusieurs **tags** : `alice`, `bob`, `famille`,
   `ops`… Gladys ne connaît alors que la clé et les tags, jamais vos mots de
   passe.
2. **Des URL Apprise collées dans Gladys** : envoyées avec chaque
   notification. Plus simple, mais les URL (avec leurs mots de passe) sont
   stockées dans Gladys, masquées.

## Mise en place

Installez l'intégration depuis **Intégrations → Installer depuis GitHub** avec
l'adresse `https://github.com/guim31/gladys-apprise`, puis remplissez son
écran de configuration :

- **Adresse de l'API Apprise** : l'adresse par laquelle vous ouvrez l'API
  Apprise, port compris, par exemple `http://192.168.1.10:8000`. Une API
  servie sous un chemin derrière un reverse proxy
  (`https://example.org/apprise`) fonctionne aussi.
- **Clé de la configuration enregistrée** : `apprise` par défaut.
- **Tags partagés** : les services joints par l'action de scène et le test.
  `famille, ops` joint les services marqués `famille` **ou** `ops` ;
  `famille ops` (une espace) ceux marqués `famille` **et** `ops` ; `all` tous
  les services. Laissé vide : seulement les services sans aucun tag.
- **URL Apprise partagées (au lieu d'une configuration)** : facultatif. Si
  elles sont données, l'action de scène et le test les utilisent et ignorent
  la clé et les tags.
- **Type de notification par défaut** : Information, Succès, Avertissement ou
  Échec. Apprise le transmet aux services qui le connaissent (couleur, icône).
- **Mettre en forme les messages en Markdown** : activé par défaut. Gladys
  écrit gras, listes et liens en Markdown ; Apprise les convertit pour chaque
  service.
- **Derrière un reverse proxy (facultatif)** : l'API Apprise n'a pas
  d'identification propre. Si vous la protégez par un reverse proxy, donnez
  l'**utilisateur** et le **mot de passe** de son authentification basique, ou
  un **en-tête supplémentaire** comme `X-Api-Key: …`.
- **Accepter un certificat auto-signé** : seulement pour une adresse en
  `https://` dont vous avez créé le certificat vous-même.
- **Langue des textes de l'intégration** : français par défaut.

Ensuite, chaque personne qui veut recevoir les messages que Gladys lui envoie
ouvre **Mon compte** (dans la page de l'intégration) et remplit :

- **Vos tags** : ses tags dans la configuration enregistrée, par exemple
  `alice` ;
- ou **Vos URL Apprise (au lieu des tags)** : ses propres services, masqués.

Laisser les deux vides veut dire « ne m'envoie rien ».

Enfin, utilisez **Envoyer une notification de test** (ou le bouton du widget) :
elle vérifie l'API, dit combien de services et quels tags contient la
configuration, et envoie une notification de test à la destination partagée.

## Ce que Gladys envoie

- **Les messages à une personne** : une scène « Envoyer un message », les
  réponses de Gladys, ses messages système. Ils partent vers les tags ou les
  URL du **Mon compte** de cette personne, avec le type par défaut, en
  Markdown.
- **Les images de caméra** (action de scène « Envoyer une image de caméra ») :
  envoyées en pièce jointe aux services qui en acceptent (Telegram, Discord,
  e-mail…). Si l'API Apprise refuse les pièces jointes
  (`APPRISE_ATTACH_SIZE=0`), le texte part seul avec une ligne qui le dit.
- **Les notifications de scène** : l'action décrite plus bas.

## Tableau de bord

Le widget **Apprise** montre si l'API répond, combien de notifications sont
parties aujourd'hui et combien ont échoué (avec la raison du dernier échec),
les dernières notifications envoyées par les scènes avec leur type, et un
bouton **Envoyer un test**. Les messages que Gladys envoie à une personne sont
comptés mais jamais affichés : le tableau de bord est commun à la maison.

## Scènes

### Déclencheurs

- **API Apprise hors ligne** : l'API ne répond plus (deux vérifications à
  30 secondes d'écart). Variable : l'erreur.
- **API Apprise de retour** : l'API répond de nouveau après avoir été hors
  ligne.
- **Notification Apprise non envoyée** : un message n'a pas pu partir. Filtres :
  la raison (Apprise injoignable, configuration à vérifier, un service a
  échoué, notification refusée) et l'expéditeur (un message de Gladys, l'action
  de scène Apprise). Au plus une fois par raison toutes les 15 minutes : une
  scène qui y répond par une autre notification ne boucle pas. Variables :
  raison, expéditeur, erreur.

### Actions

**Envoyer une notification Apprise** :

- **Titre** : facultatif.
- **Message** : obligatoire ; les variables de scène fonctionnent.
- **Type** : Par défaut de l'intégration, Information, Succès, Avertissement
  ou Échec.
- **Tags** : facultatif ; remplace les tags partagés pour cette notification
  (configuration enregistrée seulement), par exemple `ops`.

Sorties : **Notification envoyée** (oui / non) et **Erreur**, pour continuer la
scène autrement quand rien n'est parti.

### Idées de scènes

- La machine à laver a fini : « Envoyer une notification Apprise » vers
  `famille`, type Succès.
- Une fuite d'eau : type Échec, tags `famille, ops`, pour joindre à la fois la
  conversation familiale et l'e-mail de la personne d'astreinte.
- **Notification Apprise non envoyée** → passer une lampe en rouge, ou envoyer
  le message par une autre intégration.

## Dépannage

- **« aucune API Apprise à cette adresse »** : l'adresse ne mène pas à l'API
  Apprise (mauvais port, ou chemin manquant derrière le reverse proxy).
- **« aucune configuration enregistrée sous cette clé dans Apprise »** :
  vérifiez la clé dans la page web de l'API Apprise.
- **« aucun service de la configuration n'a ces tags »** : les tags de
  **Mon compte** ou les tags partagés ne correspondent à aucune URL. Sans tag,
  seules les URL sans tag sont jointes ; `all` joint tous les services.
- **« un service ne l'a pas reçue »** : Apprise a joint l'API du service, qui a
  refusé ou échoué (jeton faux, webhook expiré…). Les logs de l'API Apprise
  nomment le service. Quand plusieurs services sont prévenus, les autres l'ont
  bien reçue.
- **« accès refusé »** : le reverse proxy a refusé l'utilisateur, le mot de
  passe ou l'en-tête.
- **Logs détaillés** : définissez la variable d'environnement
  `LOG_LEVEL=debug`. Les logs ne montrent jamais une URL Apprise, un mot de
  passe ni la valeur d'un en-tête.

## Limites

- Envoi seulement : Apprise ne rapporte aucun message vers Gladys.
- Gladys attend 5 secondes l'envoi d'un message. Si l'API Apprise ne répond pas
  dans les 4 secondes après avoir reçu toute la requête, le message compte
  comme envoyé : Apprise continue de le livrer, son résultat n'est pas connu.
- La livraison est aussi fiable que chaque service : Apprise signale un échec,
  il ne réessaie pas plus tard.
- Le type est une indication : les services sans couleur ni icône l'ignorent.
- La notification de test part vers la destination partagée seulement, pas
  vers le **Mon compte** de chacun.
- Sans lien avec Apprise ni son auteur.

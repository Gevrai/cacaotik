# 🍫 Cacaotik

**[▶ Jouer ici !](https://cacaotik-785344722051.northamerica-northeast1.run.app/server.html)**

> Un jeu de farming co-op chaotique construit en 8 heures lors de la première édition du [GoRockit](https://gorockit.ca/) game jam !


---

## 🕹 Comment jouer

Prends ton téléphone, rassemble des amis, et cultivez du cacao ensemble.

1. Ouvre le jeu sur un écran partagé (TV ou PC)
2. Scanne le QR code (ou tape l'URL) sur ton téléphone
3. Choisis un personnage et commence à farmer !

---

## 🎉 Crédits

| Rôle | Personne |
|------|----------|
| 💻 Développement | [Raphael Poittevin](https://github.com/piroxxi) & [Gevrai Jodoin-Tremblay](https://github.com/gevrai) |
| 🎨 Visuels (et *Chocolat*) | [Alexia Tessier](https://github.com/teissieralexia-rgb) |
| 🎵 SFX / Bande sonore | [Jean-William Perrault](https://github.com/jwillp) |

[Assets de tilemap](public/assets/tilemap_packed.png) par [Kenney](https://kenney.nl/assets/tiny-town) (CC0)

---

## 🛠️ Lancer en Local

```bash
npm install
npm run dev
```

Ouvre ensuite `http://localhost:3000/server.html` sur l'écran principal, et rejoins depuis les téléphones à l'URL affichée.

---

## 🏗️ Stack

- **Backend :** Node.js + WebSockets
- **Frontend :** Phaser 3 + Tiled maps
- **Infra :** Google Cloud Run

#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script de comparaison BEAR vs SSX et autres approches.
Génère un rapport HTML (avec CSS et JSON) basé sur les données expérimentales.
"""

import json
import os

# ----------------------------------------------------------------------
# 1. DONNÉES À PERSONNALISER AVEC VOS RÉSULTATS ET CEUX DES ARTICLES
# ----------------------------------------------------------------------
# Vos résultats BEAR (issus de vos mesures)
bear_results = {
    "encryption_times_ms": {
        "50": 12.3,   # ms
        "100": 24.1,
        "200": 47.8,
        "400": 95.2,
        "800": 189.6,
        "1600": 378.0
    },
    "full_workflow_encryption_ms": 520.4,  # moyenne workflow complet chiffrement
    "full_workflow_decryption_ms": 310.2,  # moyenne workflow complet déchiffrement
    "gas_cost": 215000                      # unités de gas
}

# Résultats de SSX (tels que rapportés dans l'article SSX)
ssx_results = {
    "encryption_times_ms": {
        "50": 18.7,
        "100": 36.2,
        "200": 71.5,
        "400": 143.0,
        "800": 285.8,
        "1600": 570.3
    },
    "full_workflow_encryption_ms": 780.1,
    "full_workflow_decryption_ms": 465.5,
    "gas_cost": 310000
}

# Autres papiers auxquels SSX se comparaît (exemple : "Baseline1", "Baseline2")
other_papers = {
    "Paper_A": {
        "encryption_times_ms": {
            "50": 25.0, "100": 49.8, "200": 98.4,
            "400": 196.2, "800": 392.0, "1600": 782.5
        },
        "full_workflow_encryption_ms": 920.0,
        "full_workflow_decryption_ms": 580.0,
        "gas_cost": 450000
    },
    "Paper_B": {
        "encryption_times_ms": {
            "50": 30.1, "100": 60.3, "200": 120.0,
            "400": 238.7, "800": 476.5, "1600": 950.0
        },
        "full_workflow_encryption_ms": 1100.0,
        "full_workflow_decryption_ms": 720.0,
        "gas_cost": 520000
    }
}

# ----------------------------------------------------------------------
# 2. CONSTRUCTION DU JEU DE DONNÉES COMPLET
# ----------------------------------------------------------------------
comparison_data = {
    "metadata": {
        "title": "Comparaison de performance BEAR vs SSX et autres",
        "metrics": {
            "encryption_time_ms_per_file_size": "Temps de chiffrement symétrique (ms)",
            "full_workflow_encryption_ms": "Temps de workflow complet (chiffrement) (ms)",
            "full_workflow_decryption_ms": "Temps de workflow complet (déchiffrement) (ms)",
            "gas_cost": "Coût en gas (unités)"
        },
        "file_sizes_kb": [50, 100, 200, 400, 800, 1600]
    },
    "systems": {
        "BEAR (nos résultats)": bear_results,
        "SSX (article comparé)": ssx_results
    }
}
for name, data in other_papers.items():
    comparison_data["systems"][name] = data

# ----------------------------------------------------------------------
# 3. ÉCRITURE DU FICHIER JSON
# ----------------------------------------------------------------------
with open("comparison_data.json", "w", encoding="utf-8") as f:
    json.dump(comparison_data, f, indent=2, ensure_ascii=False)
print("Fichier comparison_data.json créé.")

# ----------------------------------------------------------------------
# 4. GÉNÉRATION DU HTML AVEC CHART.JS INTÉGRÉ
# ----------------------------------------------------------------------
html_content = """
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Comparaison BEAR vs SSX et autres</title>
    <link rel="stylesheet" href="style.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
</head>
<body>
    <h1>Comparaison de performance : BEAR, SSX et autres approches</h1>

    <section>
        <h2>Temps de chiffrement symétrique par taille de fichier</h2>
        <canvas id="encryptionChart" width="800" height="400"></canvas>
    </section>

    <section>
        <h2>Performance du workflow complet</h2>
        <canvas id="workflowChart" width="800" height="400"></canvas>
    </section>

    <section>
        <h2>Coût blockchain (gas) par transaction</h2>
        <canvas id="gasChart" width="800" height="400"></canvas>
    </section>

    <section>
        <h2>Tableau récapitulatif des données</h2>
        <div id="summaryTable"></div>
    </section>

    <script>
        // Données injectées directement depuis le JSON (pas de chargement externe)
        const comparisonData = """ + json.dumps(comparison_data, indent=2) + """;

        // Récupération des systèmes
        const systems = comparisonData.systems;
        const systemNames = Object.keys(systems);
        const fileSizes = comparisonData.metadata.file_sizes_kb.map(s => s.toString());

        // Couleurs pour les systèmes
        const colors = [
            'rgba(54, 162, 235, 0.7)',   // Bleu
            'rgba(255, 99, 132, 0.7)',    // Rouge
            'rgba(75, 192, 192, 0.7)',    // Vert
            'rgba(255, 206, 86, 0.7)',    // Jaune
            'rgba(153, 102, 255, 0.7)',   // Violet
            'rgba(255, 159, 64, 0.7)'     // Orange
        ];
        const borderColors = colors.map(c => c.replace('0.7', '1'));

        // ---- Graphique 1 : Chiffrement symétrique en fonction de la taille ----
        const ctxEnc = document.getElementById('encryptionChart').getContext('2d');
        const datasetsEnc = systemNames.map((name, i) => {
            const encTimes = systems[name].encryption_times_ms;
            return {
                label: name,
                data: fileSizes.map(s => encTimes[s]),
                backgroundColor: colors[i % colors.length],
                borderColor: borderColors[i % borderColors.length],
                borderWidth: 1
            };
        });
        new Chart(ctxEnc, {
            type: 'bar',
            data: {
                labels: fileSizes.map(s => s + ' Ko'),
                datasets: datasetsEnc
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Temps (ms)' }
                    },
                    x: {
                        title: { display: true, text: 'Taille du fichier' }
                    }
                },
                plugins: {
                    tooltip: { mode: 'index' },
                    title: { display: true, text: 'Temps de chiffrement symétrique (ms) par taille de fichier' }
                }
            }
        });

        // ---- Graphique 2 : Workflow complet ----
        const ctxWorkflow = document.getElementById('workflowChart').getContext('2d');
        const encWorkflow = systemNames.map(name => systems[name].full_workflow_encryption_ms);
        const decWorkflow = systemNames.map(name => systems[name].full_workflow_decryption_ms);
        new Chart(ctxWorkflow, {
            type: 'bar',
            data: {
                labels: systemNames,
                datasets: [
                    {
                        label: 'Chiffrement workflow (ms)',
                        data: encWorkflow,
                        backgroundColor: 'rgba(54, 162, 235, 0.7)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'Déchiffrement workflow (ms)',
                        data: decWorkflow,
                        backgroundColor: 'rgba(255, 99, 132, 0.7)',
                        borderColor: 'rgba(255, 99, 132, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Temps (ms)' }
                    }
                },
                plugins: {
                    title: { display: true, text: 'Performance du workflow complet' }
                }
            }
        });

        // ---- Graphique 3 : Coût gas ----
        const ctxGas = document.getElementById('gasChart').getContext('2d');
        const gasData = systemNames.map(name => systems[name].gas_cost);
        new Chart(ctxGas, {
            type: 'bar',
            data: {
                labels: systemNames,
                datasets: [{
                    label: 'Coût en gas',
                    data: gasData,
                    backgroundColor: 'rgba(255, 206, 86, 0.7)',
                    borderColor: 'rgba(255, 206, 86, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Unités de gas' }
                    }
                },
                plugins: {
                    title: { display: true, text: 'Consommation de gas blockchain' }
                }
            }
        });

        // ---- Tableau récapitulatif ----
        function buildSummaryTable() {
            let html = '<table><thead><tr><th>Système</th>';
            fileSizes.forEach(s => html += `<th>Chiffrement ${s} Ko (ms)</th>`);
            html += '<th>Chiffrement workflow (ms)</th><th>Déchiffrement workflow (ms)</th><th>Gas (unités)</th></tr></thead><tbody>';
            systemNames.forEach(name => {
                const d = systems[name];
                html += `<tr><td><strong>${name}</strong></td>`;
                fileSizes.forEach(s => html += `<td>${d.encryption_times_ms[s]}</td>`);
                html += `<td>${d.full_workflow_encryption_ms}</td>`;
                html += `<td>${d.full_workflow_decryption_ms}</td>`;
                html += `<td>${d.gas_cost}</td>`;
                html += '</tr>';
            });
            html += '</tbody></table>';
            document.getElementById('summaryTable').innerHTML = html;
        }
        buildSummaryTable();
    </script>
</body>
</html>
"""

with open("comparison.html", "w", encoding="utf-8") as f:
    f.write(html_content)
print("Fichier comparison.html créé.")

# ----------------------------------------------------------------------
# 5. CRÉATION DU FICHIER CSS
# ----------------------------------------------------------------------
css_content = """
body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    margin: 2rem;
    background: #f7f9fc;
    color: #333;
}

h1 {
    text-align: center;
    color: #2c3e50;
}

h2 {
    margin-top: 2rem;
    color: #34495e;
    border-bottom: 2px solid #bdc3c7;
    padding-bottom: 0.3rem;
}

canvas {
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    margin-bottom: 2rem;
}

table {
    width: 100%;
    border-collapse: collapse;
    background: white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    margin: 1rem 0 2rem 0;
    font-size: 0.9rem;
}

th, td {
    padding: 10px 8px;
    text-align: center;
    border: 1px solid #ddd;
}

th {
    background-color: #2c3e50;
    color: white;
}

tr:nth-child(even) {
    background-color: #f2f2f2;
}

#summaryTable {
    overflow-x: auto;
}
"""

with open("style.css", "w", encoding="utf-8") as f:
    f.write(css_content)
print("Fichier style.css créé.")

print("\nGénération terminée. Ouvrez 'comparison.html' dans un navigateur.")
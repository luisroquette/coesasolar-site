# Memory: ai-gym/google-sheets-evaluation-dataset-v1
Updated: now

Integração Google Sheets para Evaluation Dataset configurada. Edge function 'append-evaluation-sheet' usa Service Account (sofia-sheets@sofia-n8n-485814.iam.gserviceaccount.com) com JWT RS256 para autenticar na Google Sheets API v4. Planilha ID: 1pjgHCrwCoQTAtheQgB9Lz8Q9RdsbX89E_-yNfgFmUSA. Colunas: Id (Telefone), Contexto, Mensagem_lead, Resposta_Agente, Problema, Resposta_esperada, Categoria, Severidade. Secret: GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON. Botão 'Enviar p/ Planilha' adicionado no DetectedErrorsPanel para exportar erros individuais direto para o dataset de avaliação.

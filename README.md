# Gerador de Propostas

Avalie a planilha anexada. Quero transforma-la num aplicativo. O Obejtivo é criar uma Maquina de Gerar Propostas para a COESA Energia:

O objetivo dessa planilha é criar dois tipos de propostas diferentes de maneira simples, rápida, fácil e bastante intuitiva. Repare, os dois tipos de propostas são: proposta assinantes e depois proposta usineiro. 

O usuário preenche a aba input assinantes somente as células marcadas de amarelo e, ao preenchê-la, ele já recebe uma proposta 100% pronta e lealtada na aba proposta assinantes. É só ele portanto gerar um PDF daquele Excel. Portanto, o objetivo do nosso sistema será exatamente esse: replicar os campos que devem ser preenchidos, realizar toda a matemática (a memória de cálculo incluída nesse Excel) e, na ponta final, soltar o output que será o nosso PDF lealtado nos mesmos moldes. 

2. Proposta Usineiro [Invest.tesaer]
Em contrapartida, a segunda funcionalidade dessa planilha é gerar as propostas para os usineiros na aba Invest Teaser. Conforme o usuário preenche as células demarcadas na cor amarela na aba Input Usineiros, toda a memória de cálculo que está amarrada pelas fórmulas do Excel vão preenchendo todas as informações da aba Invest Teaser e, como resultado final, gera a nossa proposta. O user, portanto, simplesmente transforma em PDF e pronto, sua proposta está pronta. 

3. A Aba "In.Cash Flow: essa aba traz uma projeção via fluxo de caixa descontado das premissas utilizadas para preencher a proposta ao usineiro intitulada InvestEaser. Ela também é preenchida conforme o input de dados dado na aba Input Usineiros. 

4. Aba: "Macroeconomics": essa aba traz projeção de crescimento dos principais indicadores financeiros do Brasil. Ela serve tão somente para a correção de valores da aba in.cash flow. 

5. Cidades: essa aba é importante para calcular a geração de energia estiamda apra as usinas otovoltaicas. ela traz o indice solarimetrico apra TODAS as cidades do BRASIL e, tais numeros servem como base de calculo para a geracao de energia da usinas que aparece la na aba "Imput. Usineiros".

-> divida o sistema em duas partes principais: gerador de propostas para assinantes de energia (incluirá as abas "Input Assinantes" e "Proposta Assinantes" 2 da nossa planilha) e, por fim, a parte de Usineiros, englobará a parte "Aba Input Usineiros", "Invest Teaser" e "In Cash Flow".  - não há necessidade de abas separadas para macroeconomics e cidades. Menos é mais. Vamos otimizar. Uma janela de configurações seria suficiente. 

-> o sistema precisa ser absolutamente independente e configurável como é o meu. Nada de hard inputs.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://coesa-propose-craft.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ff2f9802-9605-4d7d-9ad9-b405b9717438).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Autoblog — gate de qualidade

O pipeline de geração de posts (`src/app/api/blog/generate`) roda um gate de qualidade por LLM (score 0-100) depois do checklist on-page e antes de publicar; ele é opcional — sem `DEEPSEEK_API_KEY` o gate é pulado e o artigo publica normalmente.

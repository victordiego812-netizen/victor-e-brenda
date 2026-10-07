# Ativação das contribuições

Estado inicial: pagamentos desativados. Nenhuma credencial está no repositório.

1. Reativar o projeto casamento-victor-brenda (kujulxyzgotulafuqoza), sem apagar dados. Atualmente o limite de dois projetos Free impede restaurá-lo.
2. Executar setup/mercado-pago.sql nesse projeto. Os registros financeiros ficam privados e somente o servidor pode acessá-los.
3. Confirmar com o Mercado Pago a aceitação de presentes pessoais de casamento nesta conta CPF.
4. Criar uma aplicação dedicada ao casamento no Mercado Pago Developers.
5. Configurar na Vercel, projeto victor-e-brenda, variáveis protegidas:
   - WEDDING_SUPABASE_SECRET_KEY: chave secreta do projeto do casamento; nunca usar no navegador.
   - MP_ACCESS_TOKEN: credencial privada da aplicação do casamento.
   - MP_WEBHOOK_SECRET: assinatura secreta dos Webhooks da mesma aplicação.
   - MP_MODE: test durante homologação; live somente após validação.
   - WEDDING_PAYMENTS_ENABLED: false inicialmente; true somente no ambiente em validação.
6. Cadastrar Webhook de pagamentos em https://victor-e-brenda.vercel.app/api/contributions?webhook=1 (para homologação usar a URL do ambiente e ajustar BASE no código antes).
7. Homologar checkout, pagamento pendente, aprovação, repetição de webhook, retorno, pagamento recusado e devolução. Teste não conta como presente real.
8. Configurar credenciais de produção e MP_MODE=live. Fazer deploy e validar antes de divulgar.

As metas iniciais reutilizam suggested_value dos presentes existentes. Revisar esses valores com os noivos antes da ativação. Reservas físicas existentes continuam funcionando; cotas Pix passam a contribuições. O progresso soma o líquido aprovado depois das taxas e devoluções; nunca soma a simples geração do checkout.

Não há promessa fiscal automática. Cadastro do pagador retornado pelo provedor pode estar incompleto: verificar relatórios e documentação necessária para IR/ITCMD com contador. Não publicar CPF ou nomes dos contribuintes.

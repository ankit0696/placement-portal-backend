module.exports = ({ env }) => ({
  // ...
  email: {
    config: {
      provider: 'nodemailer',
      providerOptions: {
        host: env('SMTP_HOST', 'smtp.office365.com'),
        port: env('SMTP_PORT', 587),
        auth: {
          user: env('SMTP_USERNAME'),
          pass: env('SMTP_PASSWORD'),
          // ... any custom nodemailer options
        },
      },
      settings: {
        defaultFrom: 'no-reply@iitp.ac.in',
        defaultReplyTo: 'no-reply@iitp.ac.in',
      },
    },
  },

  // ...
})

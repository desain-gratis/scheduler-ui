import type { AppProps } from 'next/app';
import Head from 'next/head';
import Layout from '@/components/Layout';
import { SchedulerProvider } from '@/context/SchedulerContext';
import '@/styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <SchedulerProvider>
      <Head>
        <title>scheduler-ui</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </SchedulerProvider>
  );
}

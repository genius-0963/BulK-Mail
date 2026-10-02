import { useEffect, useMemo, useRef, useState } from 'react';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight, CheckCircle2, ChevronDown, CircleAlert,
  FileSpreadsheet, LoaderCircle, Mail, Plus, Send, ShieldCheck,
  Trash2, Upload, X,
} from 'lucide-react';
import { Link, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import {
  getGetCampaignStatusQueryKey, getGetGmailProfileQueryKey,
  useGetCampaignStatus, useGetGmailProfile, useSendCampaign,
} from '@workspace/api-client-react';
import type { CampaignRecipient, CampaignSendInput, CampaignStatus } from '@workspace/api-client-react';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

const appearance = {
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#315f50',
    colorForeground: '#26373e',
    colorMutedForeground: '#69787d',
    colorDanger: '#b3443b',
    colorBackground: '#fffdf8',
    colorInput: '#fffdf8',
    colorInputForeground: '#26373e',
    colorNeutral: '#d8d2c6',
    fontFamily: "'DM Sans', sans-serif",
    borderRadius: '0.8rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fffdf8] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#26373e] font-semibold',
    headerSubtitle: 'text-[#69787d]',
    socialButtonsBlockButtonText: 'text-[#26373e] font-medium',
    formFieldLabel: 'text-[#26373e] font-medium',
    footerActionLink: 'text-[#315f50] font-semibold',
    footerActionText: 'text-[#69787d]',
    dividerText: 'text-[#69787d]',
    identityPreviewEditButton: 'text-[#315f50]',
    formFieldSuccessText: 'text-[#315f50]',
    alertText: 'text-[#26373e]',
    logoBox: 'mb-5',
    logoImage: 'max-h-8',
    socialButtonsBlockButton: 'border-[#d8d2c6] bg-[#fffdf8] hover:bg-[#f5f1e9]',
    formButtonPrimary: 'bg-[#315f50] hover:bg-[#254b3f] text-white',
    formFieldInput: 'border-[#d8d2c6] bg-[#fffdf8] text-[#26373e]',
    footerAction: 'border-t border-[#e5dfd4]',
    dividerLine: 'bg-[#d8d2c6]',
    alert: 'border-[#d8d2c6]',
    otpCodeFieldInput: 'border-[#d8d2c6] bg-[#fffdf8]',
    formFieldRow: 'mb-4',
    main: 'gap-5',
  },
};

type Recipient = CampaignRecipient & { localId: string };
const recipientFieldLimits: Record<keyof CampaignRecipient, number> = {
  email: 254,
  name: 120,
  company: 160,
  role: 120,
};
const newRecipient = (): Recipient => ({ localId: crypto.randomUUID(), email: '', name: '', company: '', role: '' });
const tokenPattern = /{{\s*(name|company|role)\s*}}/gi;
const interpolate = (text: string, recipient: CampaignRecipient) => text.replace(tokenPattern, (_, key: string) => recipient[key.toLowerCase() as keyof CampaignRecipient] || '');
const supportedTokens = new Set(['name', 'company', 'role']);
const findUnsupportedTokens = (...texts: string[]) => {
  const found = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(/{{\s*([^{}]*?)\s*}}/g)) {
      const token = match[1].trim();
      if (!supportedTokens.has(token.toLowerCase())) found.add(`{{${token}}}`);
    }
  }
  return [...found];
};
const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

function Wordmark({ light = false }: { light?: boolean }) {
  return <span className={`inline-flex items-center gap-2.5 font-semibold tracking-[-.04em] ${light ? 'text-[#f5f1e8]' : 'text-[#26373e]'}`}>
    <span className={`grid size-8 place-items-center rounded-[10px] ${light ? 'bg-[#a8c9b7] text-[#203b34]' : 'bg-[#315f50] text-[#f5f1e8]'}`}><Mail size={17} strokeWidth={1.8} /></span>
    <span className="text-[19px]">letterwell<span className={light ? 'text-[#a8c9b7]' : 'text-[#789a86]'}>.</span></span>
  </span>;
}

function HomePage() {
  const { isLoaded, isSignedIn } = useAuth();
  const [, setLocation] = useLocation();
  useEffect(() => { if (isLoaded && isSignedIn) setLocation('/campaign'); }, [isLoaded, isSignedIn, setLocation]);
  return <main className="min-h-[100dvh] overflow-hidden bg-[#f6f3eb] text-[#26373e]">
    <header className="mx-auto flex max-w-[1240px] items-center justify-between px-6 py-6 md:px-10">
      <Link href="/" className="no-underline"><Wordmark /></Link>
      <nav className="flex items-center gap-3">
        <Link href="/sign-in" className="rounded-lg px-4 py-2.5 text-sm font-semibold text-[#43545a] transition hover:bg-[#eae7de]">Sign in</Link>
        <Link href="/sign-up" className="rounded-lg bg-[#315f50] px-4 py-2.5 text-sm font-semibold text-[#fffdf8] shadow-sm transition hover:bg-[#244b3d]">Create account</Link>
      </nav>
    </header>
    <section className="relative mx-auto grid max-w-[1240px] items-center gap-10 px-6 pb-20 pt-14 md:grid-cols-[1.08fr_.92fr] md:px-10 md:pb-32 md:pt-20">
      <div className="relative z-10 enter">
        <p className="mb-6 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[.18em] text-[#638171]"><span className="h-px w-7 bg-[#87a694]" />A more thoughtful way to reach out</p>
        <h1 className="max-w-[680px] font-serif text-[58px] leading-[.99] tracking-[-.035em] sm:text-[72px] md:text-[82px]">Good outreach<br /><em className="text-[#648574]">feels personal.</em></h1>
        <p className="mt-7 max-w-[480px] text-[17px] leading-7 text-[#69787d]">Write one note. Make it yours for every person. Review each message, then send individually from your own Gmail.</p>
        <div className="mt-9 flex flex-wrap items-center gap-4">
          <Link href="/sign-up" className="inline-flex items-center gap-3 rounded-xl bg-[#315f50] px-5 py-3.5 text-[15px] font-semibold text-[#fffdf8] shadow-[0_8px_24px_rgba(49,95,80,.17)] transition hover:-translate-y-0.5 hover:bg-[#244b3d]">Start a campaign <ArrowRight size={17} /></Link>
          <span className="flex items-center gap-2 text-xs text-[#69787d]"><ShieldCheck size={15} className="text-[#638171]" /> You stay in control of every send</span>
        </div>
        <div className="mt-14 flex items-center gap-8 border-t border-[#ded9cf] pt-5 text-xs text-[#69787d]">
          <span><b className="mr-1.5 font-mono text-[#315f50]">01</b> Personalize</span><span><b className="mr-1.5 font-mono text-[#315f50]">02</b> Review</span><span><b className="mr-1.5 font-mono text-[#315f50]">03</b> Approve</span>
        </div>
      </div>
      <div className="relative mx-auto w-full max-w-[510px] enter enter-delay-2">
        <div className="absolute -right-14 -top-12 h-72 w-72 rounded-full bg-[#e5e8dc] blur-[1px]" />
        <div className="absolute -bottom-10 -left-12 h-56 w-56 rounded-full bg-[#eadbc8]/70 blur-[1px]" />
        <div className="relative rotate-[1.2deg] rounded-[24px] border border-[#e5e0d5] bg-[#fffdf8] p-6 shadow-[0_32px_80px_rgba(47,59,53,.13)] sm:p-8">
          <div className="flex items-center justify-between border-b border-[#ede8dd] pb-5"><div className="flex items-center gap-2 text-sm font-semibold"><span className="grid size-8 place-items-center rounded-full bg-[#e3eee7] text-[#315f50]"><Mail size={15} /></span> New message</div><span className="font-mono text-[10px] uppercase tracking-wider text-[#889391]">Draft · 01</span></div>
          <div className="space-y-4 py-5 text-sm">
            <div className="flex gap-5 border-b border-[#f0ece4] pb-3"><span className="w-12 text-[#98a09b]">To</span><span className="text-[#4d5c60]">jordan@fieldwork.studio</span></div>
            <div className="flex gap-5 border-b border-[#f0ece4] pb-3"><span className="w-12 text-[#98a09b]">Subject</span><span className="text-[#4d5c60]">A thought for Fieldwork</span></div>
            <div className="space-y-3 pt-2 leading-6 text-[#536367]"><p>Hi Jordan,</p><p>I’ve been following the work you’re doing at <span className="rounded bg-[#e6eee7] px-1 text-[#315f50]">Fieldwork</span> and had an idea I thought you might like.</p><p>Would a quick conversation next week be useful?</p><p>Warmly,<br />Alex</p></div>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-[#f5f3ec] p-3.5"><span className="flex items-center gap-2 text-xs font-medium text-[#63736d]"><CheckCircle2 size={15} className="text-[#56816a]" /> Previewing Jordan’s message</span><span className="font-mono text-[10px] text-[#87908b]">1 OF 08</span></div>
          <div className="mt-4 flex justify-end"><span className="inline-flex items-center gap-2 rounded-lg bg-[#315f50] px-4 py-2.5 text-xs font-semibold text-[#fffdf8]"><Send size={13} /> Send approved batch</span></div>
        </div>
        <div className="absolute -bottom-8 -right-4 rounded-xl border border-[#e7e2d8] bg-[#fffdf8] px-4 py-3 shadow-lg"><p className="font-mono text-[10px] uppercase tracking-wider text-[#82908b]">Review status</p><p className="mt-1 flex items-center gap-2 text-sm font-semibold"><span className="size-2 rounded-full bg-[#6a9c79]" /> Ready for your approval</p></div>
      </div>
    </section>
    <section className="border-y border-[#ded9cf] bg-[#eeece3]">
      <div className="mx-auto grid max-w-[1240px] gap-8 px-6 py-12 md:grid-cols-[.7fr_1.3fr] md:px-10 md:py-16">
        <p className="font-mono text-[11px] uppercase tracking-[.18em] text-[#789080]">Small batch, by design</p>
        <div className="grid gap-8 sm:grid-cols-3">
          {[['One message, made personal', 'Merge each person’s name, company, and role without losing your own voice.'], ['A real review before send', 'Step through every recipient’s exact message before you approve anything.'], ['Sent from your Gmail', 'Each note is delivered separately through your connected account.']].map(([title, copy], i) => <article key={title} className="border-t border-[#cfcbbf] pt-4"><span className="font-mono text-xs text-[#829489]">0{i + 1}</span><h2 className="mt-4 text-base font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-[#6c7978]">{copy}</p></article>)}
        </div>
      </div>
    </section>
    <footer className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-6 py-7 text-xs text-[#7c8884] md:px-10"><Wordmark /><span>Careful notes. Sent one at a time.</span></footer>
  </main>;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted && char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
      row = []; cell = '';
    } else cell += char;
  }
  if (quoted) throw new Error('This CSV has an unclosed quoted field.');
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}

function CampaignPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const [, setLocation] = useLocation();
  const { signOut, user } = useClerk();
  const profile = useGetGmailProfile({ query: { enabled: isLoaded && !!isSignedIn, queryKey: getGetGmailProfileQueryKey() } });
  const sendCampaign = useSendCampaign({ mutation: { retry: false } });
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [csvError, setCsvError] = useState('');
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [initialStatus, setInitialStatus] = useState<CampaignStatus | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const campaignRequestRef = useRef<CampaignSendInput | null>(null);
  const campaignStatusQuery = useGetCampaignStatus(activeCampaignId ?? '', {
    query: {
      enabled: isLoaded && !!isSignedIn && !!activeCampaignId,
      queryKey: getGetCampaignStatusQueryKey(activeCampaignId ?? ''),
      refetchInterval: (query) => (query.state.data?.state ?? initialStatus?.state) === 'sending' ? 2000 : false,
    },
  });
  const campaignStatus = campaignStatusQuery.data ?? initialStatus;
  const sendingInProgress = campaignStatus?.state === 'sending';
  const formLocked = sendCampaign.isPending || sendingInProgress;
  const uncertainAttempt = sendCampaign.isError && campaignRequestRef.current !== null;
  const compositionLocked = formLocked || uncertainAttempt;
  useEffect(() => { if (isLoaded && !isSignedIn) setLocation('/sign-in'); }, [isLoaded, isSignedIn, setLocation]);
  const activeRecipient = recipients.find((item) => item.localId === selectedId) ?? recipients[0];
  const recipientsWithoutIds = useMemo(() => recipients.map(({ localId: _id, ...recipient }) => recipient), [recipients]);
  const validation = useMemo(() => recipients.map((recipient) => ({
    id: recipient.localId,
    issues: [
      !validEmail(recipient.email) ? 'Enter a valid email address' : '',
      recipient.email.length > recipientFieldLimits.email ? 'Email exceeds 254 characters' : '',
      !recipient.name.trim() ? 'Name is required' : '',
      recipient.name.length > recipientFieldLimits.name ? 'Name exceeds 120 characters' : '',
      !recipient.company.trim() ? 'Company is required' : '',
      recipient.company.length > recipientFieldLimits.company ? 'Company exceeds 160 characters' : '',
      !recipient.role.trim() ? 'Role is required' : '',
      recipient.role.length > recipientFieldLimits.role ? 'Role exceeds 120 characters' : '',
      interpolate(subject.trim(), recipient).length > 200 ? 'Personalized subject exceeds 200 characters' : '',
      interpolate(body.trim(), recipient).length > 10000 ? 'Personalized message exceeds 10,000 characters' : '',
    ].filter(Boolean),
  })), [recipients, subject, body]);
  const emailCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const recipient of recipients) {
      const email = recipient.email.trim().toLowerCase();
      if (email) counts.set(email, (counts.get(email) ?? 0) + 1);
    }
    return counts;
  }, [recipients]);
  for (let index = 0; index < validation.length; index += 1) {
    const recipient = recipients[index];
    const result = validation[index];
    if (recipient && result && emailCounts.get(recipient.email.trim().toLowerCase())! > 1) {
      result.issues.push('Email is duplicated');
    }
  }
  const errors = validation.flatMap((item) => item.issues);
  const unsupportedTokens = useMemo(() => findUnsupportedTokens(subject, body), [subject, body]);
  const previewSubjectLength = activeRecipient ? interpolate(subject.trim(), activeRecipient).length : subject.trim().length;
  const previewBodyLength = activeRecipient ? interpolate(body.trim(), activeRecipient).length : body.trim().length;
  const canSend = recipients.length > 0 && recipients.length <= 100 && !errors.length &&
    subject.trim().length > 0 && subject.length <= 200 && body.trim().length > 0 &&
    body.length <= 10000 && unsupportedTokens.length === 0 && confirmed && !!profile.data && !formLocked && !uncertainAttempt &&
    campaignStatus?.state !== 'completed';
  const canRetrySameCampaign = uncertainAttempt && confirmed && !formLocked;
  const completedCount = (campaignStatus?.sentCount ?? 0) + (campaignStatus?.failedCount ?? 0);
  const progressPercent = campaignStatus?.totalCount
    ? Math.min(100, Math.round(completedCount / campaignStatus.totalCount * 100))
    : 0;
  const resetCompletedCampaign = () => {
    if (campaignStatus?.state === 'completed') {
      setActiveCampaignId(null);
      setInitialStatus(null);
    }
    setConfirmed(false);
  };
  const patchRecipient = (id: string, key: keyof CampaignRecipient, value: string) => {
    setRecipients((items) => items.map((item) => item.localId === id ? { ...item, [key]: value } : item));
    resetCompletedCampaign();
  };
  const addRecipient = () => {
    if (recipients.length >= 100) return;
    const recipient = newRecipient();
    setRecipients((items) => [...items, recipient]);
    setSelectedId(recipient.localId);
    resetCompletedCampaign();
  };
  const importCsv = async (file?: File) => {
    if (!file) return;
    setCsvError('');
    try {
      const rows = parseCsv(await file.text());
      if (!rows.length) throw new Error('This file has no recipient rows.');
      const headers = rows[0].map((value) => value.replace(/^\uFEFF/, '').toLowerCase().trim());
      const required = ['email', 'name', 'company', 'role'];
      if (required.some((field) => !headers.includes(field))) throw new Error('Use these column headers: email, name, company, role.');
      const imported = rows.slice(1).map((values) => ({
        localId: crypto.randomUUID(),
        email: values[headers.indexOf('email')] ?? '',
        name: values[headers.indexOf('name')] ?? '',
        company: values[headers.indexOf('company')] ?? '',
        role: values[headers.indexOf('role')] ?? '',
      })).filter((item) => item.email || item.name || item.company || item.role);
      if (!imported.length) throw new Error('No recipients found beneath the header row.');
      if (recipients.length + imported.length > 100) throw new Error('A campaign can include up to 100 recipients.');
      setRecipients((items) => [...items, ...imported]);
      setSelectedId(imported[0].localId);
      resetCompletedCampaign();
    } catch (error) {
      setCsvError(error instanceof Error ? error.message : 'The CSV could not be read.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const deleteRecipient = (id: string) => {
    const next = recipients.filter((item) => item.localId !== id);
    setRecipients(next);
    if (selectedId === id) setSelectedId(next[0]?.localId ?? '');
    resetCompletedCampaign();
  };
  const sendStoredRequest = (request: CampaignSendInput) => {
    sendCampaign.mutate({ data: request }, {
      onSuccess: (status) => {
        campaignRequestRef.current = null;
        setInitialStatus(status);
        setActiveCampaignId(status.campaignId);
      },
      onError: () => setConfirmed(false),
    });
  };
  const submit = () => {
    if (!confirmed || formLocked) return;
    if (uncertainAttempt) {
      const storedRequest = campaignRequestRef.current;
      if (storedRequest) sendStoredRequest(storedRequest);
      return;
    }
    if (!canSend) return;
    const request: CampaignSendInput = {
        campaignId: crypto.randomUUID(),
        recipients: recipientsWithoutIds,
        subject: subject.trim(),
        body: body.trim(),
        confirmed: true,
    };
    campaignRequestRef.current = request;
    sendStoredRequest(request);
  };
  const startDifferentBatch = () => {
    const approved = window.confirm(
      'Send status is uncertain. Check your Gmail Sent folder before starting a different batch. Continue only after confirming whether the previous campaign sent.',
    );
    if (!approved) return;
    campaignRequestRef.current = null;
    sendCampaign.reset();
    setConfirmed(false);
  };
  if (!isLoaded || (isSignedIn && !user)) return <div className="min-h-[100dvh] bg-[#f6f3eb] p-8"><div className="mx-auto max-w-5xl animate-pulse"><div className="h-12 w-48 rounded-lg bg-[#e6e2d8]" /><div className="mt-12 h-32 rounded-2xl bg-[#e6e2d8]" /><div className="mt-6 grid grid-cols-2 gap-6"><div className="h-80 rounded-2xl bg-[#e6e2d8]" /><div className="h-80 rounded-2xl bg-[#e6e2d8]" /></div></div></div>;
  if (!isSignedIn) return null;
  return <div className="min-h-[100dvh] bg-[#f6f3eb] text-[#26373e]">
    <header className="sticky top-0 z-30 border-b border-[#e4dfd4] bg-[#f9f7f1]/95 backdrop-blur">
      <div className="mx-auto flex h-[68px] max-w-[1440px] items-center justify-between px-4 sm:px-7">
        <Link href="/campaign" className="no-underline"><Wordmark /></Link>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-full border border-[#d9e3da] bg-[#eef4ee] px-3 py-1.5 text-xs font-medium text-[#426450] sm:flex"><span className="size-1.5 rounded-full bg-[#6a9c79]" /> Campaign workspace</div>
          <button onClick={() => signOut({ redirectUrl: basePath || '/' })} className="rounded-lg px-3 py-2 text-xs font-semibold text-[#67777a] hover:bg-[#ece9e0]">Sign out</button>
          <span className="grid size-9 place-items-center rounded-full bg-[#dfe9df] text-xs font-semibold text-[#315f50]">{user?.firstName?.slice(0, 1) ?? 'U'}</span>
        </div>
      </div>
    </header>
    <main className="mx-auto max-w-[1440px] px-4 pb-16 pt-8 sm:px-7 sm:pt-11">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#7c9385]">Outreach · New campaign</p><h1 className="mt-2 font-serif text-4xl tracking-[-.025em] sm:text-[46px]">A note worth opening.</h1><p className="mt-2 text-sm text-[#718080]">Shape one message, then make sure every version feels like it was meant for them.</p></div>
        <div className="flex items-center gap-2 rounded-xl border border-[#e4dfd4] bg-[#fffdf8] px-3.5 py-2.5">
          {profile.isLoading ? <span className="h-3 w-36 animate-pulse rounded bg-[#e7e3d9]" /> : profile.isError ? <><CircleAlert size={15} className="text-[#b3443b]" /><span className="text-xs text-[#9c4940]">Gmail connection unavailable</span><button className="ml-1 text-xs font-semibold underline" onClick={() => profile.refetch()}>Retry</button></> : <><span className="grid size-7 place-items-center rounded-full bg-[#e9f0e8] text-[#466d55]"><Mail size={14} /></span><div><p className="font-mono text-[9px] uppercase tracking-wider text-[#8b9690]">Sending from</p><p className="max-w-[210px] truncate text-xs font-semibold" data-testid="text-gmail-email">{profile.data?.emailAddress}</p></div></>}
        </div>
      </div>
      <div className="mb-6 grid grid-cols-3 rounded-xl border border-[#e5dfd4] bg-[#eeece4] p-1">
        {[['01', 'Recipients'], ['02', 'Write'], ['03', 'Review & send']].map(([number, label], index) => <div key={number} className={`flex items-center justify-center gap-2 rounded-lg px-2 py-2.5 text-xs ${index === 0 ? 'bg-[#fffdf8] font-semibold text-[#315f50] shadow-sm' : 'text-[#85908b]'}`}><span className="font-mono text-[10px]">{number}</span><span>{label}</span></div>)}
      </div>
      {profile.isError && <div className="mb-5 flex gap-2 rounded-xl border border-[#e8c8be] bg-[#fbefeb] p-3 text-sm text-[#913f35]"><CircleAlert size={18} className="shrink-0" />Reconnect or retry your Gmail profile before sending. Your campaign stays here.</div>}
      <div className="grid items-start gap-5 xl:grid-cols-[.95fr_1.05fr]">
        <div className="space-y-5">
          <section className="overflow-hidden rounded-2xl border border-[#e5dfd4] bg-[#fffdf8] shadow-[0_4px_16px_rgba(51,61,54,.035)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eee9df] px-5 py-4 sm:px-6">
              <div><div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-lg bg-[#e7efe8] font-mono text-[11px] font-medium text-[#315f50]">01</span><h2 className="text-sm font-semibold">Who are you writing to?</h2></div><p className="ml-9 mt-1 text-xs text-[#87918c]">{recipients.length} of 100 recipients</p></div>
              <div className="flex items-center gap-2">
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => importCsv(event.target.files?.[0])} data-testid="input-recipient-csv" />
                <button onClick={() => fileRef.current?.click()} disabled={compositionLocked} className="inline-flex items-center gap-2 rounded-lg border border-[#dcd8ce] px-3 py-2 text-xs font-semibold text-[#52635e] transition hover:bg-[#f5f3ed] disabled:opacity-45" data-testid="button-import-csv"><Upload size={14} />Import CSV</button>
                <button onClick={addRecipient} disabled={recipients.length >= 100 || compositionLocked} className="inline-flex items-center gap-2 rounded-lg bg-[#315f50] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#254b3f] disabled:opacity-45" data-testid="button-add-recipient"><Plus size={14} />Add person</button>
              </div>
            </div>
            {csvError && <div className="mx-5 mt-4 flex items-start justify-between gap-3 rounded-lg bg-[#fbefeb] px-3 py-2.5 text-xs text-[#984a40] sm:mx-6"><span>{csvError}</span><button onClick={() => setCsvError('')} aria-label="Dismiss CSV error"><X size={15} /></button></div>}
            <div className="px-4 pb-4 pt-3 sm:px-6">
              {recipients.length === 0 ? <div className="grid min-h-[186px] place-items-center rounded-xl border border-dashed border-[#d8d8ca] bg-[#faf9f4] px-5 text-center">
                <div><span className="mx-auto grid size-10 place-items-center rounded-xl bg-[#e8eee6] text-[#567660]"><FileSpreadsheet size={19} /></span><p className="mt-3 text-sm font-semibold">Start with your first recipient</p><p className="mt-1 text-xs text-[#84908b]">Add someone manually or import a CSV with email, name, company, role.</p></div>
              </div> : <div className="space-y-2">
                <div className="hidden grid-cols-[1.15fr_1fr_1fr_.9fr_32px] gap-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-[#9aa19a] sm:grid"><span>Email</span><span>Name</span><span>Company</span><span>Role</span></div>
                {recipients.map((recipient, index) => <div key={recipient.localId} className={`rounded-xl border p-2 transition ${activeRecipient?.localId === recipient.localId ? 'border-[#adc3b2] bg-[#f5f8f3]' : 'border-[#eee9df] bg-[#fffdf8]'}`} data-testid={`row-recipient-${index}`}>
                  <div className="grid gap-2 sm:grid-cols-[1.15fr_1fr_1fr_.9fr_32px]">
                    {(['email', 'name', 'company', 'role'] as const).map((field) => <label key={field} className="block">
                      <span className="mb-1 block px-1 text-[9px] uppercase tracking-wider text-[#a0a59e] sm:hidden">{field}</span>
                      <input disabled={compositionLocked} maxLength={recipientFieldLimits[field]} value={recipient[field]} onFocus={() => setSelectedId(recipient.localId)} onChange={(event) => patchRecipient(recipient.localId, field, event.target.value)} placeholder={field === 'email' ? 'email@company.com' : field} className={`w-full rounded-md border px-2 py-2 text-xs outline-none transition focus:border-[#86a992] focus:ring-2 focus:ring-[#dce9dc] disabled:opacity-70 ${validation[index]?.issues.some((issue) => (field === 'email' && issue.toLowerCase().includes('email')) || (field === 'name' && issue.toLowerCase().includes('name')) || (field === 'company' && issue.toLowerCase().includes('company')) || (field === 'role' && issue.toLowerCase().includes('role'))) ? 'border-[#e7c7bd] bg-[#fffaf8]' : 'border-[#e9e5dc] bg-white'}`} data-testid={`input-recipient-${field}-${index}`} />
                    </label>)}
                    <button disabled={compositionLocked} onClick={() => deleteRecipient(recipient.localId)} aria-label={`Remove ${recipient.name || `recipient ${index + 1}`}`} className="grid size-8 place-items-center self-end rounded-md text-[#a3a59d] hover:bg-[#f8eae6] hover:text-[#a5443a] disabled:opacity-40" data-testid={`button-remove-recipient-${index}`}><Trash2 size={14} /></button>
                  </div>
                  {!!validation[index]?.issues.length && <p className="mt-1.5 px-1 text-[10px] text-[#a34b40]">{validation[index].issues.join(' · ')}</p>}
                </div>)}
              </div>}
              {recipients.length > 0 && <div className="mt-3 flex items-center justify-between px-1 text-[10px] text-[#89938d]"><span>CSV columns: email, name, company, role</span><button disabled={compositionLocked} onClick={() => { setRecipients([]); resetCompletedCampaign(); }} className="text-[#8e8179] underline decoration-[#c8bdb3] underline-offset-2 hover:text-[#a5443a] disabled:opacity-40" data-testid="button-clear-recipients">Clear list</button></div>}
            </div>
          </section>
          <section className="rounded-2xl border border-[#e5dfd4] bg-[#fffdf8] p-5 shadow-[0_4px_16px_rgba(51,61,54,.035)] sm:p-6">
            <div className="mb-5 flex items-center gap-2"><span className="grid size-7 place-items-center rounded-lg bg-[#e7efe8] font-mono text-[11px] font-medium text-[#315f50]">02</span><div><h2 className="text-sm font-semibold">Write your note</h2><p className="text-xs text-[#87918c]">A few details can make a note feel unmistakably theirs.</p></div></div>
            <label className="block"><span className="mb-1.5 flex items-center justify-between text-xs font-semibold text-[#5b696a]"><span>Subject</span><span className={`font-mono text-[10px] ${subject.length > 200 ? 'text-[#a5443a]' : 'text-[#a1a49d]'}`}>{subject.length}/200</span></span><input disabled={compositionLocked} value={subject} onChange={(e) => { setSubject(e.target.value); resetCompletedCampaign(); }} maxLength={220} placeholder="A thought for {{company}}" className="w-full rounded-lg border border-[#dedbd1] bg-[#fcfbf7] px-3.5 py-3 text-sm outline-none transition placeholder:text-[#a0a69f] focus:border-[#86a992] focus:ring-2 focus:ring-[#dce9dc] disabled:opacity-70" data-testid="input-subject" /></label>
            {subject.length > 200 && <p className="mt-1 text-[11px] text-[#a34b40]">Keep the subject to 200 characters or fewer.</p>}
            <label className="mt-4 block"><span className="mb-1.5 flex items-center justify-between text-xs font-semibold text-[#5b696a]"><span>Message</span><span className={`font-mono text-[10px] ${body.length > 10000 ? 'text-[#a5443a]' : 'text-[#a1a49d]'}`}>{body.length}/10,000</span></span><textarea disabled={compositionLocked} value={body} onChange={(e) => { setBody(e.target.value); resetCompletedCampaign(); }} maxLength={10500} rows={9} placeholder={'Hi {{name}},\n\nI’ve been following what you’re doing at {{company}} and thought I’d reach out.\n\nWould a quick conversation be useful?\n\nWarmly,\nYour name'} className="w-full resize-y rounded-lg border border-[#dedbd1] bg-[#fcfbf7] px-3.5 py-3 text-sm leading-6 outline-none transition placeholder:text-[#a0a69f] focus:border-[#86a992] focus:ring-2 focus:ring-[#dce9dc] disabled:opacity-70" data-testid="input-body" /></label>
            {body.length > 10000 && <p className="mt-1 text-[11px] text-[#a34b40]">Keep the message to 10,000 characters or fewer.</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-[10px] font-semibold uppercase tracking-wider text-[#919a92]">Personalize with</span>{['{{name}}', '{{company}}', '{{role}}'].map((token) => <button disabled={compositionLocked} key={token} type="button" onClick={() => { setBody((value) => `${value}${value && !value.endsWith(' ') && !value.endsWith('\n') ? ' ' : ''}${token}`); resetCompletedCampaign(); }} className="rounded-md border border-[#d9e2d8] bg-[#f3f7f2] px-2 py-1 font-mono text-[10px] text-[#436b55] hover:bg-[#e9f0e8] disabled:opacity-45" data-testid={`button-token-${token.slice(2, -2)}`}>{token}</button>)}</div>
          </section>
        </div>
        <div className="space-y-5 xl:sticky xl:top-[88px]">
          <section className="overflow-hidden rounded-2xl border border-[#dcded1] bg-[#eeefe7] shadow-[0_4px_16px_rgba(51,61,54,.035)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dcdfd4] px-5 py-4 sm:px-6">
              <div><div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-lg bg-[#dce8dd] font-mono text-[11px] font-medium text-[#315f50]">03</span><h2 className="text-sm font-semibold">Review each message</h2></div><p className="ml-9 mt-1 text-xs text-[#808c83]">See exactly what each person will receive.</p></div>
              {recipients.length > 0 && <div className="relative"><select value={activeRecipient?.localId ?? ''} onChange={(event) => setSelectedId(event.target.value)} className="max-w-[190px] appearance-none rounded-lg border border-[#d6d9cf] bg-[#f9f9f3] py-2 pl-3 pr-8 text-xs font-medium outline-none focus:border-[#86a992]" data-testid="select-preview-recipient">{recipients.map((person, i) => <option key={person.localId} value={person.localId}>{person.name || `Recipient ${i + 1}`}{person.company ? ` · ${person.company}` : ''}</option>)}</select><ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-2.5 text-[#839087]" /></div>}
            </div>
            {activeRecipient ? <div className="p-4 sm:p-6">
              <div className="overflow-hidden rounded-xl border border-[#e8e4d9] bg-[#fffdf8] shadow-[0_5px_18px_rgba(49,61,53,.05)]">
                <div className="border-b border-[#eeeae2] px-5 py-4 text-xs">
                  <div className="flex gap-3"><span className="w-12 text-[#9aa19a]">To</span><span className="font-medium text-[#4e5e60]">{activeRecipient.name || 'Name'} <span className="text-[#8b9690]">&lt;{activeRecipient.email || 'email address'}&gt;</span></span></div>
                  <div className="mt-3 flex gap-3"><span className="w-12 text-[#9aa19a]">Subject</span><span className="font-medium text-[#394b4f]">{interpolate(subject.trim() || 'Your subject line', activeRecipient)}</span></div>
                </div>
                <div className="min-h-[250px] whitespace-pre-wrap px-5 py-5 text-[13px] leading-6 text-[#526265]">{interpolate(body.trim() || 'Your message will appear here as you write.', activeRecipient)}</div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eeeae2] bg-[#faf9f5] px-5 py-3"><span className="flex items-center gap-1.5 text-[10px] text-[#87928c]"><CheckCircle2 size={13} className="text-[#6a9975]" />Individual message preview</span><span className="font-mono text-[9px] text-[#8f9991]">Subject {previewSubjectLength}/200 · Message {previewBodyLength}/10,000</span><span className="font-mono text-[9px] uppercase tracking-wider text-[#a0a59e]">{Math.max(recipients.findIndex((r) => r.localId === activeRecipient.localId) + 1, 1)} / {recipients.length}</span></div>
              </div>
              {(previewSubjectLength > 200 || previewBodyLength > 10000) && <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-[#a34b40]"><CircleAlert size={14} className="mt-0.5 shrink-0" />This personalized message exceeds {previewSubjectLength > 200 ? 'the 200-character subject limit' : ''}{previewSubjectLength > 200 && previewBodyLength > 10000 ? ' and ' : ''}{previewBodyLength > 10000 ? 'the 10,000-character body limit' : ''}. Shorten the template or recipient details.</p>}
              {!!activeRecipient.email && !validEmail(activeRecipient.email) && <p className="mt-3 flex items-center gap-1.5 text-xs text-[#a34b40]"><CircleAlert size={13} /> Check this recipient’s email address before sending.</p>}
            </div> : <div className="grid min-h-[325px] place-items-center px-6 text-center"><div><span className="mx-auto grid size-11 place-items-center rounded-xl bg-[#dce8dd] text-[#577760]"><Mail size={19} /></span><p className="mt-3 text-sm font-semibold">Your preview will live here</p><p className="mt-1 max-w-[240px] text-xs leading-5 text-[#879189]">Add a recipient and a message to see the finished note.</p></div></div>}
          </section>
          <section className="rounded-2xl border border-[#e5dfd4] bg-[#fffdf8] p-5 sm:p-6">
            <div className="flex items-start gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#f3ede0] text-[#9b7645]"><ShieldCheck size={17} /></span><div><h2 className="text-sm font-semibold">A deliberate final check</h2><p className="mt-1 text-xs leading-5 text-[#788580]">Each email is sent individually from your Gmail. Nothing goes out until you approve this batch.</p></div></div>
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[#e7e3d9] bg-[#faf9f4] p-3.5 transition hover:border-[#c6d5c7]">
              <input type="checkbox" disabled={formLocked} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 size-4 accent-[#315f50] disabled:opacity-50" data-testid="checkbox-confirm-send" />
              <span className="text-xs leading-5 text-[#52615e]">I have reviewed the recipient list and message previews. I approve sending {recipients.length || 'this'} individual {recipients.length === 1 ? 'email' : 'emails'} from my Gmail account.</span>
            </label>
            {errors.length > 0 && <p className="mt-3 flex items-center gap-1.5 text-xs text-[#a34b40]"><CircleAlert size={14} />{errors.length} recipient detail{errors.length === 1 ? '' : 's'} need attention.</p>}
            {unsupportedTokens.length > 0 && <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-[#a34b40]" role="alert"><CircleAlert size={14} className="mt-0.5 shrink-0" /><span>Unsupported merge tag{unsupportedTokens.length > 1 ? 's' : ''}: <span className="font-mono">{unsupportedTokens.join(', ')}</span>. Use only {'{{name}}'}, {'{{company}}'}, or {'{{role}}'}.</span></p>}
            {uncertainAttempt && <div className="mt-3 rounded-xl border border-[#e8c9bb] bg-[#fbf1eb] p-3.5 text-xs leading-5 text-[#88483d]" role="alert" data-testid="alert-uncertain-send">
              <p className="font-semibold">We couldn’t confirm the send response.</p>
              <p className="mt-1">The approved request is retained with the same campaign ID and exact payload. Retry it safely, or check Gmail Sent before starting a different batch.</p>
              <button type="button" onClick={startDifferentBatch} className="mt-2 font-semibold underline underline-offset-2" data-testid="button-start-different-batch">Start a different batch…</button>
            </div>}
            <button onClick={submit} disabled={uncertainAttempt ? !canRetrySameCampaign : !canSend} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#315f50] px-4 py-3.5 text-sm font-semibold text-[#fffdf8] shadow-[0_5px_16px_rgba(49,95,80,.16)] transition hover:bg-[#254b3f] disabled:cursor-not-allowed disabled:bg-[#aeb9af] disabled:shadow-none" data-testid="button-send-campaign">
              {sendCampaign.isPending ? <><LoaderCircle size={17} className="animate-spin" />Starting your approved batch…</> : sendingInProgress ? <><LoaderCircle size={17} className="animate-spin" />Batch sending · {campaignStatus?.sentCount ?? 0} of {campaignStatus?.totalCount ?? recipients.length} sent</> : uncertainAttempt ? <><Send size={16} />Retry same approved batch</> : campaignStatus?.state === 'completed' ? <><CheckCircle2 size={16} />Batch complete · edit to start another</> : <><Send size={16} />Approve & send {recipients.length || ''} {recipients.length === 1 ? 'email' : 'emails'}</>}
            </button>
            <p className="mt-2 text-center text-[10px] leading-4 text-[#939b94]">Each recipient receives a separate message. No CC or BCC.</p>
          </section>
          {campaignStatus && <section className="overflow-hidden rounded-2xl border border-[#d7e3d8] bg-[#f7faf5]" data-testid="status-send-results">
            <div className="border-b border-[#e1e9df] px-5 py-4">
              <div className="flex items-center gap-2">
                {campaignStatus.state === 'sending' ? <LoaderCircle size={17} className="animate-spin text-[#648574]" /> : <CheckCircle2 size={18} className="text-[#548063]" />}
                <div><h2 className="text-sm font-semibold">{campaignStatus.state === 'sending' ? 'Your batch is on its way' : 'Batch complete'}</h2><p className="mt-0.5 text-[10px] text-[#87918b]">{campaignStatus.state === 'sending' ? 'Recipient-by-recipient progress · updates every 2 seconds' : 'Every message has reached a final status.'}</p></div>
                {campaignStatus.state === 'sending' && <span className="ml-auto rounded-full bg-[#e7efe8] px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-[#4d7057]">Sending</span>}
              </div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#e1e8de]"><div className="h-full rounded-full bg-[#628b6d]" style={{ width: `${progressPercent}%` }} /></div>
              <p className="mt-2 flex items-center justify-between font-mono text-[10px] text-[#78867e]"><span>{completedCount} of {campaignStatus.totalCount} complete</span><span>{campaignStatus.sentCount} sent · {campaignStatus.failedCount} failed</span></p>
            </div>
            {campaignStatusQuery.isError && campaignStatus.state === 'sending' && <div className="flex items-center justify-between gap-3 border-b border-[#e1e9df] bg-[#fbf2ec] px-5 py-2.5 text-[11px] text-[#965143]"><span>Could not refresh progress. Sending status has not been changed.</span><button onClick={() => campaignStatusQuery.refetch()} className="shrink-0 font-semibold underline" data-testid="button-retry-status">Refresh status</button></div>}
            <ul className="max-h-[300px] divide-y divide-[#e5ebe2] overflow-auto">{campaignStatus.results.map((item, index) => {
              const statusClass = item.status === 'sent'
                ? 'bg-[#e4efe4] text-[#456c50]'
                : item.status === 'failed'
                  ? 'bg-[#f7e9e4] text-[#a34b40]'
                  : item.status === 'sending'
                    ? 'bg-[#e8eef0] text-[#526d78]'
                    : 'bg-[#eeece4] text-[#797f79]';
              return <li key={`${item.email}-${index}`} className="flex items-center justify-between gap-3 px-5 py-3 text-xs" data-testid={`result-recipient-${index}`}>
                <div className="min-w-0"><p className="truncate font-medium">{item.name || item.email}</p><p className="truncate text-[10px] text-[#87918b]">{item.email}{item.error ? ` · ${item.error}` : ''}</p></div>
                <span className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[9px] uppercase ${statusClass}`} data-testid={`status-recipient-${index}`}>
                  {item.status === 'sending' && <LoaderCircle size={10} className="animate-spin" />}{item.status}
                </span>
              </li>;
            })}</ul>
          </section>}
        </div>
      </div>
    </main>
    <footer className="border-t border-[#e3ded3] bg-[#f2f0e8]"><div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-5 text-[10px] text-[#87918b] sm:px-7"><span>Review every message. Send only when you’re ready.</span><span className="font-mono uppercase tracking-wider">Letterwell · Gmail campaign workspace</span></div></footer>
  </div>;
}

function SignInPage() {
  return <div className="flex min-h-[100dvh] items-center justify-center bg-[#f6f3eb] px-4 py-10"><div className="absolute left-6 top-6 sm:left-10 sm:top-9"><Link href="/" className="no-underline"><Wordmark /></Link></div><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} forceRedirectUrl={`${basePath}/campaign`} /></div>;
}
function SignUpPage() {
  return <div className="flex min-h-[100dvh] items-center justify-center bg-[#f6f3eb] px-4 py-10"><div className="absolute left-6 top-6 sm:left-10 sm:top-9"><Link href="/" className="no-underline"><Wordmark /></Link></div><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} forceRedirectUrl={`${basePath}/campaign`} /></div>;
}
function ClerkCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previousUser = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user: current }) => {
      const id = current?.id ?? null;
      if (previousUser.current !== undefined && previousUser.current !== id) client.clear();
      previousUser.current = id;
    });
    return unsubscribe;
  }, [addListener, client]);
  return null;
}
function RoutedApp() {
  const [, setLocation] = useLocation();
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={appearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    localization={{
      signIn: { start: { title: 'Welcome back', subtitle: 'Pick up where your next good note begins.' } },
      signUp: { start: { title: 'Make your next note personal', subtitle: 'Create your Letterwell workspace.' } },
    }}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
  >
    <QueryClientProvider client={queryClient}>
      <ClerkCacheInvalidator />
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/campaign" component={CampaignPage} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route><main className="grid min-h-[100dvh] place-items-center bg-[#f6f3eb] px-6 text-center"><div><Wordmark /><h1 className="mt-8 font-serif text-5xl">We couldn’t find that page.</h1><Link href="/" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#315f50]">Back to home <ArrowRight size={15} /></Link></div></main></Route>
      </Switch>
    </QueryClientProvider>
  </ClerkProvider>;
}
function App() {
  return <WouterRouter base={basePath}><RoutedApp /></WouterRouter>;
}

export default App;
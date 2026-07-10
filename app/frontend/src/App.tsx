import Shell from "@/components/Shell";
import { I18nProvider } from "@/lib/i18n";

export default function App() {
  return (
    <I18nProvider>
      <Shell />
    </I18nProvider>
  );
}

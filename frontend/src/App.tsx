import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { AccessMatrixPage } from '@/components/access-matrix/AccessMatrixPage';
import { HomePage } from '@/pages/HomePage';
import { ApprovalsPage } from '@/pages/ApprovalsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { CreateBlueprintPage } from '@/pages/CreateBlueprintPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/blueprint-editor" element={<Navigate to="/blueprint-editor/create" replace />} />
        <Route path="/blueprint-editor/create" element={<CreateBlueprintPage />} />
        <Route path="/access-matrix" element={<AccessMatrixPage />} />
        <Route path="/approvals" element={<ApprovalsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/access-matrix" replace />} />
      </Route>
    </Routes>
  );
}

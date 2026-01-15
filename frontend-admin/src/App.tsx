import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { ParkingPositions } from './pages/ParkingPositions';
import { LotEditor } from './pages/LotEditor';
import { Observations } from './pages/Observations';
import { Violations } from './pages/Violations';
import { Notices } from './pages/Notices';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="positions" element={<ParkingPositions />} />
          <Route path="lot-editor" element={<LotEditor />} />
          <Route path="observations" element={<Observations />} />
          <Route path="violations" element={<Violations />} />
          <Route path="notices" element={<Notices />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

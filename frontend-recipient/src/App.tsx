import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Activate from './pages/Activate';
import Profile from './pages/Profile';
import Ticket from './pages/Ticket';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Landing />} />
          <Route path="activate/:token" element={<Activate />} />
          <Route
            path="profile"
            element={
              <ProtectedRoute requireEmailVerified>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="ticket"
            element={
              <ProtectedRoute requireEmailVerified requireProfileComplete>
                <Ticket />
              </ProtectedRoute>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

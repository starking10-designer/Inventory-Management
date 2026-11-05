import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import Profile from './src/components/ProfileSection.jsx';
import './src/index.css';
function Preview(){const [user,setUser]=useState({displayName:'Sample Admin',email:'admin@example.test',username:'sampleadmin'});const [picture,setPicture]=useState(null);return <main style={{maxWidth:1600,margin:'auto',padding:24}}><Profile user={user} profilePicture={picture} setProfilePicture={setPicture} onUpdateUser={setUser} onLogout={()=>{}} setAppIcon={()=>{}} setAppBrandName={()=>{}} /></main>}
createRoot(document.getElementById('root')).render(<Preview/>);

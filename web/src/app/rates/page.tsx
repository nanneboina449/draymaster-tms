'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface RateProfile {
  id: string;
  profile_name: string;
  driver_type: string;
  pay_method: string;
  default_rate: number;
  default_percentage: number;
  waiting_free_hours: number;
  waiting_rate_per_hour: number;
  stop_pay: number;
  free_stops: number;
  hazmat_pay: number;
  overweight_pay: number;
  live_unload_pay: number;
  weekend_pay: number;
  weekly_insurance_deduction: number;
  weekly_lease_deduction: number;
  is_active: boolean;
}

interface LaneRate {
  id: string;
  origin_type: string;
  origin_value: string;
  destination_type: string;
  destination_value: string;
  flat_rate: number;
  per_mile_rate: number;
  estimated_miles: number;
  minimum_pay: number;
  is_active: boolean;
  notes: string;
}

export default function RateManagementPage() {
  const [activeTab, setActiveTab] = useState<'profiles' | 'lanes' | 'assignments'>('profiles');
  const [rateProfiles, setRateProfiles] = useState<RateProfile[]>([]);
  const [laneRates, setLaneRates] = useState<LaneRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isLaneModalOpen, setIsLaneModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<RateProfile | null>(null);
  const [editingLane, setEditingLane] = useState<LaneRate | null>(null);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [driverAssignments, setDriverAssignments] = useState<Record<string, string>>({});

  const [profileForm, setProfileForm] = useState({
    profile_name: '',
    driver_type: 'COMPANY_DRIVER',
    pay_method: 'PER_LOAD',
    default_rate: 75,
    default_percentage: 70,
    waiting_free_hours: 2,
    waiting_rate_per_hour: 25,
    stop_pay: 25,
    free_stops: 2,
    hazmat_pay: 50,
    overweight_pay: 50,
    live_unload_pay: 50,
    weekend_pay: 50,
    weekly_insurance_deduction: 0,
    weekly_lease_deduction: 0,
  });

  const [laneForm, setLaneForm] = useState({
    origin_type: 'PORT',
    origin_value: '',
    destination_type: 'ZIP',
    destination_value: '',
    flat_rate: 0,
    per_mile_rate: 0,
    estimated_miles: 0,
    minimum_pay: 0,
    notes: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const { data: profiles, error: profilesError } = await supabase
        .from('driver_rate_profiles')
        .select('*')
        .order('driver_type', { ascending: true });
      
      if (profilesError) throw profilesError;
      setRateProfiles(profiles || []);

      const { data: lanes, error: lanesError } = await supabase
        .from('lane_rates')
        .select('*')
        .order('origin_value', { ascending: true });
      
      if (lanesError) throw lanesError;
      setLaneRates(lanes || []);

      const { data: driverData, error: driversError } = await supabase
        .from('drivers')
        .select('*')
        .eq('is_active', true)
        .order('last_name', { ascending: true });
      if (driversError) throw driversError;
      setDrivers(driverData || []);

      const { data: assignmentData } = await supabase
        .from('driver_rate_assignments')
        .select('driver_id, rate_profile_id');
      const assignmentMap: Record<string, string> = {};
      (assignmentData || []).forEach((a: any) => { assignmentMap[a.driver_id] = a.rate_profile_id; });
      setDriverAssignments(assignmentMap);
    } catch (err: any) {
      console.error('Error:', err);
      alert('Error fetching data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const openProfileModal = (profile?: RateProfile) => {
    if (profile) {
      setEditingProfile(profile);
      setProfileForm({
        profile_name: profile.profile_name,
        driver_type: profile.driver_type,
        pay_method: profile.pay_method,
        default_rate: profile.default_rate || 0,
        default_percentage: profile.default_percentage || 70,
        waiting_free_hours: profile.waiting_free_hours || 2,
        waiting_rate_per_hour: profile.waiting_rate_per_hour || 25,
        stop_pay: profile.stop_pay || 25,
        free_stops: profile.free_stops || 2,
        hazmat_pay: profile.hazmat_pay || 50,
        overweight_pay: profile.overweight_pay || 50,
        live_unload_pay: profile.live_unload_pay || 50,
        weekend_pay: profile.weekend_pay || 50,
        weekly_insurance_deduction: profile.weekly_insurance_deduction || 0,
        weekly_lease_deduction: profile.weekly_lease_deduction || 0,
      });
    } else {
      setEditingProfile(null);
      setProfileForm({
        profile_name: '',
        driver_type: 'COMPANY_DRIVER',
        pay_method: 'PER_LOAD',
        default_rate: 75,
        default_percentage: 70,
        waiting_free_hours: 2,
        waiting_rate_per_hour: 25,
        stop_pay: 25,
        free_stops: 2,
        hazmat_pay: 50,
        overweight_pay: 50,
        live_unload_pay: 50,
        weekend_pay: 50,
        weekly_insurance_deduction: 0,
        weekly_lease_deduction: 0,
      });
    }
    setIsProfileModalOpen(true);
  };

  const openLaneModal = (lane?: LaneRate) => {
    if (lane) {
      setEditingLane(lane);
      setLaneForm({
        origin_type: lane.origin_type,
        origin_value: lane.origin_value,
        destination_type: lane.destination_type,
        destination_value: lane.destination_value,
        flat_rate: lane.flat_rate || 0,
        per_mile_rate: lane.per_mile_rate || 0,
        estimated_miles: lane.estimated_miles || 0,
        minimum_pay: lane.minimum_pay || 0,
        notes: lane.notes || '',
      });
    } else {
      setEditingLane(null);
      setLaneForm({
        origin_type: 'PORT',
        origin_value: '',
        destination_type: 'ZIP',
        destination_value: '',
        flat_rate: 0,
        per_mile_rate: 0,
        estimated_miles: 0,
        minimum_pay: 0,
        notes: '',
      });
    }
    setIsLaneModalOpen(true);
  };

  const saveProfile = async () => {
    try {
      if (editingProfile) {
        const { error } = await supabase
          .from('driver_rate_profiles')
          .update(profileForm)
          .eq('id', editingProfile.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('driver_rate_profiles')
          .insert({ ...profileForm, is_active: true });
        if (error) throw error;
      }
      setIsProfileModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const saveLane = async () => {
    try {
      if (editingLane) {
        const { error } = await supabase
          .from('lane_rates')
          .update(laneForm)
          .eq('id', editingLane.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('lane_rates')
          .insert({ ...laneForm, is_active: true });
        if (error) throw error;
      }
      setIsLaneModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const deleteProfile = async (id: string) => {
    if (!confirm('Delete this rate profile?')) return;
    try {
      const { error } = await supabase.from('driver_rate_profiles').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const deleteLane = async (id: string) => {
    if (!confirm('Delete this lane rate?')) return;
    try {
      const { error } = await supabase.from('lane_rates').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const saveAssignment = async (driverId: string, profileId: string) => {
    const prev = driverAssignments[driverId];
    setDriverAssignments(a => ({ ...a, [driverId]: profileId }));
    try {
      if (profileId === '') {
        await supabase.from('driver_rate_assignments').delete().eq('driver_id', driverId);
      } else {
        const { error } = await supabase
          .from('driver_rate_assignments')
          .upsert({ driver_id: driverId, rate_profile_id: profileId }, { onConflict: 'driver_id' });
        if (error) throw error;
      }
    } catch (err: any) {
      setDriverAssignments(a => prev ? { ...a, [driverId]: prev } : (() => { const n = { ...a }; delete n[driverId]; return n; })());
      alert('Error saving assignment: ' + err.message);
    }
  };

  const getDriverTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      'COMPANY_DRIVER': 'bg-blue-100 text-blue-800',
      'OWNER_OPERATOR': 'bg-green-100 text-green-800',
      'LEASE_OPERATOR': 'bg-purple-100 text-purple-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const getPayMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      'PER_LOAD': 'Per Load',
      'PER_MILE': 'Per Mile',
      'PERCENTAGE': 'Percentage',
      'HOURLY': 'Hourly',
    };
    return labels[method] || method;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Rate Management</h1>
          <p className="text-gray-500 mt-1">Configure driver pay rates, lane rates, and accessorials</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow">
        <div className="border-b px-6">
          <div className="flex gap-4">
            {[
              { id: 'profiles', label: 'Pay Profiles', icon: '👤' },
              { id: 'lanes', label: 'Lane Rates', icon: '🛣️' },
              { id: 'assignments', label: 'Driver Assignments', icon: '📋' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-3 px-4 font-medium border-b-2 transition ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {/* Pay Profiles Tab */}
          {activeTab === 'profiles' && (
            <>
              <div className="flex justify-between items-center mb-4">
                <p className="text-gray-600">
                  Define pay structures for different driver types
                </p>
                <button
                  onClick={() => openProfileModal()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  + Add Rate Profile
                </button>
              </div>

              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {rateProfiles.map((profile) => (
                    <div key={profile.id} className="border rounded-lg p-4 hover:shadow-md transition">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-semibold text-lg">{profile.profile_name}</h3>
                          <span className={`text-xs px-2 py-1 rounded ${getDriverTypeColor(profile.driver_type)}`}>
                            {profile.driver_type.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => openProfileModal(profile)}
                            className="p-1 text-gray-500 hover:text-blue-600"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => deleteProfile(profile.id)}
                            className="p-1 text-gray-500 hover:text-red-600"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Pay Method:</span>
                          <span className="font-medium">{getPayMethodLabel(profile.pay_method)}</span>
                        </div>
                        
                        {profile.pay_method === 'PERCENTAGE' ? (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Percentage:</span>
                            <span className="font-medium text-green-600">{profile.default_percentage}%</span>
                          </div>
                        ) : (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Default Rate:</span>
                            <span className="font-medium text-green-600">
                              ${profile.default_rate?.toFixed(2)}
                              {profile.pay_method === 'PER_MILE' && '/mi'}
                            </span>
                          </div>
                        )}

                        <div className="flex justify-between">
                          <span className="text-gray-500">Waiting Pay:</span>
                          <span>${profile.waiting_rate_per_hour}/hr after {profile.waiting_free_hours}hrs</span>
                        </div>

                        <div className="flex justify-between">
                          <span className="text-gray-500">Stop Pay:</span>
                          <span>${profile.stop_pay} after {profile.free_stops} stops</span>
                        </div>

                        {(profile.weekly_insurance_deduction > 0 || profile.weekly_lease_deduction > 0) && (
                          <div className="pt-2 border-t mt-2">
                            <p className="text-gray-500 text-xs mb-1">Weekly Deductions:</p>
                            {profile.weekly_insurance_deduction > 0 && (
                              <div className="flex justify-between text-red-600">
                                <span>Insurance:</span>
                                <span>-${profile.weekly_insurance_deduction}</span>
                              </div>
                            )}
                            {profile.weekly_lease_deduction > 0 && (
                              <div className="flex justify-between text-red-600">
                                <span>Lease:</span>
                                <span>-${profile.weekly_lease_deduction}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Lane Rates Tab */}
          {activeTab === 'lanes' && (
            <>
              <div className="flex justify-between items-center mb-4">
                <p className="text-gray-600">
                  Set specific pay rates for routes/lanes
                </p>
                <button
                  onClick={() => openLaneModal()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  + Add Lane Rate
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Origin</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Destination</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Flat Rate</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Per Mile</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Est. Miles</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Minimum</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {laneRates.map((lane) => (
                      <tr key={lane.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <span className="text-xs bg-gray-100 px-1 rounded">{lane.origin_type}</span>
                          <br />
                          <span className="font-medium">{lane.origin_value}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs bg-gray-100 px-1 rounded">{lane.destination_type}</span>
                          <br />
                          <span className="font-medium">{lane.destination_value}</span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-green-600">
                          {lane.flat_rate > 0 ? `$${lane.flat_rate.toFixed(2)}` : '-'}
                        </td>
                        <td className="px-4 py-3">
                          {lane.per_mile_rate > 0 ? `$${lane.per_mile_rate.toFixed(2)}/mi` : '-'}
                        </td>
                        <td className="px-4 py-3">{lane.estimated_miles || '-'}</td>
                        <td className="px-4 py-3">${lane.minimum_pay?.toFixed(2) || '0.00'}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => openLaneModal(lane)}
                            className="text-blue-600 hover:text-blue-800 mr-2"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteLane(lane.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {laneRates.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No lane rates configured. Add lane rates for route-specific pricing.
                  </div>
                )}
              </div>
            </>
          )}

          {/* Driver Assignments Tab */}
          {activeTab === 'assignments' && (
            <>
              <div className="flex justify-between items-center mb-4">
                <p className="text-gray-600">Assign pay profiles to individual drivers</p>
                <span className="text-sm text-gray-500">{drivers.length} active drivers</span>
              </div>

              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              ) : drivers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No active drivers found. <a href="/drivers" className="text-blue-600 hover:underline">Add drivers →</a>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Driver</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">CDL</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rate Profile</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {drivers.map((driver: any) => {
                        const assignedProfileId = driverAssignments[driver.id] || '';
                        const assignedProfile = rateProfiles.find(p => p.id === assignedProfileId);
                        return (
                          <tr key={driver.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <span className="font-medium">{driver.first_name} {driver.last_name}</span>
                            </td>
                            <td className="px-4 py-3 font-mono text-sm text-gray-600">{driver.cdl_number || '-'}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-1 rounded ${getDriverTypeColor(driver.driver_type || '')}`}>
                                {(driver.driver_type || 'N/A').replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={assignedProfileId}
                                onChange={e => saveAssignment(driver.id, e.target.value)}
                                className="px-3 py-2 border rounded-lg text-sm w-full max-w-xs"
                              >
                                <option value="">— No profile —</option>
                                {rateProfiles.map(p => (
                                  <option key={p.id} value={p.id}>
                                    {p.profile_name} ({getPayMethodLabel(p.pay_method)})
                                  </option>
                                ))}
                              </select>
                              {assignedProfile && (
                                <p className="text-xs text-gray-500 mt-1">
                                  {assignedProfile.pay_method === 'PERCENTAGE'
                                    ? `${assignedProfile.default_percentage}% of gross`
                                    : `$${assignedProfile.default_rate?.toFixed(2)}${assignedProfile.pay_method === 'PER_MILE' ? '/mi' : '/load'}`}
                                </p>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Rate Profile Modal */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setIsProfileModalOpen(false)}></div>
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">
                    {editingProfile ? 'Edit Rate Profile' : 'Add Rate Profile'}
                  </h2>
                  <button onClick={() => setIsProfileModalOpen(false)} className="text-white text-2xl">&times;</button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto max-h-[60vh] space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Profile Name *</label>
                  <input
                    value={profileForm.profile_name}
                    onChange={e => setProfileForm({ ...profileForm, profile_name: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg"
                    placeholder="e.g., Company Driver - Standard"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Driver Type *</label>
                    <select
                      value={profileForm.driver_type}
                      onChange={e => setProfileForm({ ...profileForm, driver_type: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                    >
                      <option value="COMPANY_DRIVER">Company Driver (W2)</option>
                      <option value="OWNER_OPERATOR">Owner Operator (1099)</option>
                      <option value="LEASE_OPERATOR">Lease Operator</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Pay Method *</label>
                    <select
                      value={profileForm.pay_method}
                      onChange={e => setProfileForm({ ...profileForm, pay_method: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                    >
                      <option value="PER_LOAD">Per Load (Flat)</option>
                      <option value="PER_MILE">Per Mile</option>
                      <option value="PERCENTAGE">Percentage of Gross</option>
                      <option value="HOURLY">Hourly</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {profileForm.pay_method === 'PERCENTAGE' ? (
                    <div>
                      <label className="block text-sm font-medium mb-1">Default Percentage (%)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={profileForm.default_percentage}
                        onChange={e => setProfileForm({ ...profileForm, default_percentage: parseFloat(e.target.value) })}
                        className="w-full px-4 py-2 border rounded-lg"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Default Rate ($){profileForm.pay_method === 'PER_MILE' && '/mile'}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={profileForm.default_rate}
                        onChange={e => setProfileForm({ ...profileForm, default_rate: parseFloat(e.target.value) })}
                        className="w-full px-4 py-2 border rounded-lg"
                      />
                    </div>
                  )}
                </div>

                <hr className="my-4" />
                <h3 className="font-semibold text-gray-700">Waiting Time / Detention</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Free Hours</label>
                    <input
                      type="number"
                      step="0.5"
                      value={profileForm.waiting_free_hours}
                      onChange={e => setProfileForm({ ...profileForm, waiting_free_hours: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Rate Per Hour ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={profileForm.waiting_rate_per_hour}
                      onChange={e => setProfileForm({ ...profileForm, waiting_rate_per_hour: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                </div>

                <hr className="my-4" />
                <h3 className="font-semibold text-gray-700">Stop Pay</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Free Stops</label>
                    <input
                      type="number"
                      value={profileForm.free_stops}
                      onChange={e => setProfileForm({ ...profileForm, free_stops: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Pay Per Extra Stop ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={profileForm.stop_pay}
                      onChange={e => setProfileForm({ ...profileForm, stop_pay: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                </div>

                <hr className="my-4" />
                <h3 className="font-semibold text-gray-700">Accessorial Pay</h3>
                
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Hazmat ($)</label>
                    <input
                      type="number"
                      value={profileForm.hazmat_pay}
                      onChange={e => setProfileForm({ ...profileForm, hazmat_pay: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Overweight ($)</label>
                    <input
                      type="number"
                      value={profileForm.overweight_pay}
                      onChange={e => setProfileForm({ ...profileForm, overweight_pay: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Live Unload ($)</label>
                    <input
                      type="number"
                      value={profileForm.live_unload_pay}
                      onChange={e => setProfileForm({ ...profileForm, live_unload_pay: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Weekend ($)</label>
                    <input
                      type="number"
                      value={profileForm.weekend_pay}
                      onChange={e => setProfileForm({ ...profileForm, weekend_pay: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                    />
                  </div>
                </div>

                {(profileForm.driver_type === 'OWNER_OPERATOR' || profileForm.driver_type === 'LEASE_OPERATOR') && (
                  <>
                    <hr className="my-4" />
                    <h3 className="font-semibold text-gray-700">Weekly Deductions</h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Insurance ($)</label>
                        <input
                          type="number"
                          value={profileForm.weekly_insurance_deduction}
                          onChange={e => setProfileForm({ ...profileForm, weekly_insurance_deduction: parseFloat(e.target.value) })}
                          className="w-full px-4 py-2 border rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Lease Payment ($)</label>
                        <input
                          type="number"
                          value={profileForm.weekly_lease_deduction}
                          onChange={e => setProfileForm({ ...profileForm, weekly_lease_deduction: parseFloat(e.target.value) })}
                          className="w-full px-4 py-2 border rounded-lg"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t flex justify-between">
                <button onClick={() => setIsProfileModalOpen(false)} className="px-6 py-2 border rounded-lg hover:bg-gray-100">
                  Cancel
                </button>
                <button onClick={saveProfile} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  {editingProfile ? 'Save Changes' : 'Create Profile'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lane Rate Modal */}
      {isLaneModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setIsLaneModalOpen(false)}></div>
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg">
              <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">
                    {editingLane ? 'Edit Lane Rate' : 'Add Lane Rate'}
                  </h2>
                  <button onClick={() => setIsLaneModalOpen(false)} className="text-white text-2xl">&times;</button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Origin Type</label>
                    <select
                      value={laneForm.origin_type}
                      onChange={e => setLaneForm({ ...laneForm, origin_type: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                    >
                      <option value="PORT">Port/Terminal</option>
                      <option value="RAIL">Rail Yard</option>
                      <option value="ZIP">ZIP Code</option>
                      <option value="CITY">City</option>
                      <option value="ZONE">Zone</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Origin Value</label>
                    <input
                      value={laneForm.origin_value}
                      onChange={e => setLaneForm({ ...laneForm, origin_value: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                      placeholder="e.g., APM Terminals"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Destination Type</label>
                    <select
                      value={laneForm.destination_type}
                      onChange={e => setLaneForm({ ...laneForm, destination_type: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                    >
                      <option value="ZIP">ZIP Code/Range</option>
                      <option value="CITY">City</option>
                      <option value="ZONE">Zone</option>
                      <option value="PORT">Port/Terminal</option>
                      <option value="RAIL">Rail Yard</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Destination Value</label>
                    <input
                      value={laneForm.destination_value}
                      onChange={e => setLaneForm({ ...laneForm, destination_value: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg"
                      placeholder="e.g., 90001-90099"
                    />
                  </div>
                </div>

                <hr />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Flat Rate ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={laneForm.flat_rate}
                      onChange={e => setLaneForm({ ...laneForm, flat_rate: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Per Mile Rate ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={laneForm.per_mile_rate}
                      onChange={e => setLaneForm({ ...laneForm, per_mile_rate: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Estimated Miles</label>
                    <input
                      type="number"
                      value={laneForm.estimated_miles}
                      onChange={e => setLaneForm({ ...laneForm, estimated_miles: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Minimum Pay ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={laneForm.minimum_pay}
                      onChange={e => setLaneForm({ ...laneForm, minimum_pay: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2 border rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Notes</label>
                  <textarea
                    value={laneForm.notes}
                    onChange={e => setLaneForm({ ...laneForm, notes: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg"
                    rows={2}
                  />
                </div>
              </div>

              <div className="px-6 py-4 bg-gray-50 border-t flex justify-between">
                <button onClick={() => setIsLaneModalOpen(false)} className="px-6 py-2 border rounded-lg hover:bg-gray-100">
                  Cancel
                </button>
                <button onClick={saveLane} className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                  {editingLane ? 'Save Changes' : 'Add Lane Rate'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

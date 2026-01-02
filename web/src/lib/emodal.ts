// eModal API Integration Service
// Place this in: web/src/lib/emodal.ts

interface EmodalConfig {
  apiKey: string;
  baseUrl: string;
  propassUrl: string;
}

interface Terminal {
  terminal_name: string;
  terminal_cd: string;
  terminal_id: string;
  move_type: string;
  appointment_type: string;
}

interface AppointmentSlot {
  date_aggregated_dttm: string;
  date: string;
  move_type: string[];
  move_type_desc: string[];
  slot_desc: string;
  slot_start_dttm: string;
  slot_end_dttm: string;
  total_appointments: number;
  allocated_appointments: number;
  blocked_flag: string;
}

interface ContainerStatus {
  container_number: string;
  status_cd: string;
  status_desc: string;
  availability: string;
  unit_use: string; // IMPORT/EXPORT
  facility_cd: string;
  facility_name: string;
  vessel_name: string;
  voyage: string;
  discharge_date: string;
  last_free_day: string;
  holds: {
    customs: boolean;
    freight: boolean;
    usda: boolean;
    tmf: boolean;
    other: boolean;
  };
  yard_location: string;
  container_size: string;
  container_type: string;
  weight: number;
}

interface DwellStats {
  terminal_id: string;
  container_count: number;
  avg_dwell_time: number;
  teu: number;
}

// Default config - In production, load from environment/database
const DEFAULT_CONFIG: EmodalConfig = {
  apiKey: process.env.EMODAL_API_KEY || '',
  baseUrl: 'https://apidocs.eds.emodal.com',
  propassUrl: 'https://propassagapi.emodal.com/api',
};

class EmodalService {
  private config: EmodalConfig;

  constructor(config?: Partial<EmodalConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private async fetchWithAuth(url: string, options: RequestInit = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'apikey': this.config.apiKey,
      ...options.headers,
    };

    const response = await fetch(url, { ...options, headers });
    
    if (!response.ok) {
      throw new Error(`eModal API Error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // ========================================
  // Terminal Metrics API
  // ========================================

  /**
   * Get list of all terminals with their IDs, codes, and supported move types
   */
  async getTerminals(version: string = '1'): Promise<{ terminals: Terminal[] }> {
    const url = `${this.config.baseUrl}/terminalmetrics/v${version}/terminals`;
    return this.fetchWithAuth(url);
  }

  /**
   * Get appointment availability for a specific terminal
   * Returns slots for the next 7 days
   */
  async getAppointmentAvailability(
    terminalId: string,
    version: string = '1'
  ): Promise<{ appointments: AppointmentSlot[] }> {
    const url = `${this.config.baseUrl}/terminalmetrics/v${version}/terminals/${terminalId}/apptavailability`;
    return this.fetchWithAuth(url);
  }

  /**
   * Get container dwell statistics for a terminal
   */
  async getDwellStatistics(
    terminalId: string,
    startDate: string, // yyyy-MM-ddTHH:mm:ss
    endDate: string,
    dwellOption: 'on_terminal_only' | 'off_terminal_only' | 'all' = 'all',
    tradeType?: 'import' | 'export',
    version: string = '1'
  ): Promise<DwellStats> {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      dwell_option: dwellOption,
    });
    if (tradeType) params.append('trade_type', tradeType);

    const url = `${this.config.baseUrl}/terminalmetrics/v${version}/terminals/${terminalId}/containerdwelltime?${params}`;
    return this.fetchWithAuth(url);
  }

  /**
   * Get appointment performance metrics
   */
  async getAppointmentPerformance(
    terminalId: string,
    startDate: string, // yyyy-MM-dd
    endDate: string,
    scacCode?: string,
    userId?: string,
    version: string = '1'
  ): Promise<any> {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    });
    if (scacCode) params.append('scac_cd', scacCode);
    if (userId) params.append('user_id', userId);

    const url = `${this.config.baseUrl}/terminalmetrics/v${version}/terminals/${terminalId}/apptperformance?${params}`;
    return this.fetchWithAuth(url);
  }

  // ========================================
  // ProPass API (Appointments)
  // ========================================

  /**
   * Get container status from ProPass
   */
  async getContainerStatus(containerNumber: string): Promise<ContainerStatus | null> {
    try {
      const url = `${this.config.propassUrl}/appointments/container/${containerNumber}`;
      const data = await this.fetchWithAuth(url);
      
      return this.mapContainerResponse(data);
    } catch (error) {
      console.error('Error fetching container status:', error);
      return null;
    }
  }

  /**
   * Get multiple container statuses
   */
  async getContainersStatus(containerNumbers: string[]): Promise<ContainerStatus[]> {
    const results = await Promise.allSettled(
      containerNumbers.map(cn => this.getContainerStatus(cn))
    );

    return results
      .filter((r): r is PromiseFulfilledResult<ContainerStatus> => 
        r.status === 'fulfilled' && r.value !== null
      )
      .map(r => r.value);
  }

  /**
   * Book an appointment
   */
  async bookAppointment(params: {
    terminalCode: string;
    containerNumber: string;
    moveType: string; // PICKUP, DROPOFF
    appointmentDate: string;
    appointmentTime: string;
    truckingCompany: string;
    driverName?: string;
    truckPlate?: string;
  }): Promise<{ appointmentNumber: string; confirmationCode: string }> {
    const url = `${this.config.propassUrl}/appointments/book`;
    return this.fetchWithAuth(url, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Cancel an appointment
   */
  async cancelAppointment(appointmentNumber: string): Promise<{ success: boolean }> {
    const url = `${this.config.propassUrl}/appointments/${appointmentNumber}/cancel`;
    return this.fetchWithAuth(url, { method: 'POST' });
  }

  /**
   * Get available appointment slots
   */
  async getAvailableSlots(params: {
    terminalCode: string;
    moveType: string;
    date: string;
  }): Promise<{ slots: Array<{ time: string; available: number }> }> {
    const queryParams = new URLSearchParams(params as any);
    const url = `${this.config.propassUrl}/appointments/slots?${queryParams}`;
    return this.fetchWithAuth(url);
  }

  // ========================================
  // Container Watchlist
  // ========================================

  /**
   * Add container to watchlist for status updates
   */
  async addToWatchlist(containerNumber: string, terminalCode: string): Promise<{ success: boolean }> {
    const url = `${this.config.propassUrl}/watchlist/add`;
    return this.fetchWithAuth(url, {
      method: 'POST',
      body: JSON.stringify({ containerNumber, terminalCode }),
    });
  }

  /**
   * Remove container from watchlist
   */
  async removeFromWatchlist(containerNumber: string): Promise<{ success: boolean }> {
    const url = `${this.config.propassUrl}/watchlist/remove`;
    return this.fetchWithAuth(url, {
      method: 'POST',
      body: JSON.stringify({ containerNumber }),
    });
  }

  /**
   * Get all containers on watchlist with current status
   */
  async getWatchlist(): Promise<{ containers: ContainerStatus[] }> {
    const url = `${this.config.propassUrl}/watchlist`;
    return this.fetchWithAuth(url);
  }

  // ========================================
  // Helper Methods
  // ========================================

  private mapContainerResponse(data: any): ContainerStatus {
    // Map eModal response to our internal format
    // This mapping may need adjustment based on actual API response
    return {
      container_number: data.unitinfo?.unit_nbr || data.container_number,
      status_cd: data.unitstatusinfo?.status_cd || data.status,
      status_desc: data.unitstatusinfo?.status_desc || data.status_description,
      availability: data.unitstatusinfo?.status_cd === 'Y' ? 'AVAILABLE' : 'NOT_AVAILABLE',
      unit_use: data.unitstatusinfo?.unituse_desc || data.unit_use,
      facility_cd: data.currentlocationinfo?.facility_cd || data.terminal_code,
      facility_name: data.currentlocationinfo?.facility || data.terminal_name,
      vessel_name: data.arrivalinfo?.carrier_cd || data.vessel,
      voyage: data.voyage || '',
      discharge_date: data.discharge_date || '',
      last_free_day: data.last_free_day || '',
      holds: {
        customs: data.holds?.customs || false,
        freight: data.holds?.freight || false,
        usda: data.holds?.usda || false,
        tmf: data.holds?.tmf || false,
        other: data.holds?.other || false,
      },
      yard_location: data.yard_location || '',
      container_size: data.unitinfo?.unitsztype_cd?.substring(0, 2) || data.size || '40',
      container_type: data.unitinfo?.unitsztype_cd?.substring(2) || data.type || 'DRY',
      weight: data.weight || 0,
    };
  }

  /**
   * Parse hold string from eModal to boolean flags
   * eModal sometimes returns holds as comma-separated string
   */
  parseHolds(holdsString: string): ContainerStatus['holds'] {
    const holds = holdsString?.toLowerCase() || '';
    return {
      customs: holds.includes('customs') || holds.includes('cbp'),
      freight: holds.includes('freight') || holds.includes('ssl'),
      usda: holds.includes('usda') || holds.includes('agriculture'),
      tmf: holds.includes('tmf'),
      other: holds.includes('other') || holds.includes('terminal'),
    };
  }

  /**
   * Calculate estimated demurrage based on LFD
   */
  calculateDemurrage(lastFreeDay: string, dailyRate: number = 150): number {
    if (!lastFreeDay) return 0;
    
    const lfd = new Date(lastFreeDay);
    const today = new Date();
    const diffDays = Math.floor((today.getTime() - lfd.getTime()) / (1000 * 60 * 60 * 24));
    
    return diffDays > 0 ? diffDays * dailyRate : 0;
  }
}

// Export singleton instance
export const emodal = new EmodalService();

// Export class for custom instances
export { EmodalService };
export type { EmodalConfig, Terminal, AppointmentSlot, ContainerStatus, DwellStats };
